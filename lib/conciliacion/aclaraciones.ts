import "server-only";

import { connection } from "next/server";

import { getAgenciaId, type UsuarioSesion } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { comisionesEsperadas, SELECT_RECIBO_ESPERADA } from "@/lib/conciliacion/esperada";
import { TOLERANCIA_MXN, type TipoNota } from "@/lib/conciliacion/tipos";
import { db } from "@/lib/db";

/** Seguimiento: "reclamada" si ya se reclamó a la aseguradora (una nota simple no lo cambia). */
export type Seguimiento = "por_aclarar" | "reclamada";

/**
 * Recibos PAGADOS (cobrados con diferencia de comisión) pendientes de aclarar, con la comisión
 * esperada, la pagada y su historial de seguimiento.
 */
export async function getAclaraciones() {
  await connection();
  const agenciaId = await getAgenciaId();
  const recibos = await db.recibo.findMany({
    where: { agenciaId, estado: "PAGADO" },
    orderBy: { fecha_vencimiento: "asc" },
    select: {
      ...SELECT_RECIBO_ESPERADA,
      folio: true,
      comision_pagada: true,
      poliza: {
        select: {
          ...SELECT_RECIBO_ESPERADA.poliza.select,
          numeroImpreso: true,
          cliente: { select: { nombre: true } },
          aseguradora: { select: { nombre: true, color_hex: true } },
          _count: { select: { recibos: true } },
        },
      },
      notas: {
        orderBy: { created_at: "desc" },
        select: { id: true, created_at: true, tipo: true, texto: true, monto: true, usuario_email: true },
      },
    },
  });
  const esperadas = await comisionesEsperadas(agenciaId, recibos);

  return recibos.map((r) => {
    const e = esperadas.get(r.id);
    const pagada = Number(r.comision_pagada ?? 0);
    const esperada = e && e.esperada !== null ? e.esperada : null;
    return {
      id: r.id,
      numero: r.numero,
      total: r.poliza._count.recibos,
      folio: r.folio,
      fechaVencimiento: r.fecha_vencimiento.toISOString(),
      poliza: { id: r.poliza.id, numero: r.poliza.numeroImpreso },
      cliente: r.poliza.cliente.nombre,
      aseguradora: r.poliza.aseguradora,
      pagada,
      esperada,
      porcentaje: e && e.esperada !== null ? e.porcentaje : null,
      motivoSinEsperada: e && e.esperada === null ? e.motivo : null,
      diferencia: esperada === null ? null : Math.round((pagada - esperada) * 100) / 100,
      seguimiento: (r.notas.some((n) => n.tipo === "reclamo") ? "reclamada" : "por_aclarar") as Seguimiento,
      notas: r.notas.map((n) => ({
        ...n,
        created_at: n.created_at.toISOString(),
        monto: n.monto === null ? null : Number(n.monto),
      })),
    };
  });
}
export type Aclaracion = Awaited<ReturnType<typeof getAclaraciones>>[number];

/** Cuántos recibos hay por aclarar (para avisos). */
export async function contarAclaraciones() {
  const agenciaId = await getAgenciaId();
  return db.recibo.count({ where: { agenciaId, estado: "PAGADO" } });
}

export class AclaracionError extends Error {}

const ETIQUETA_NOTA: Record<TipoNota, string> = {
  nota: "Nota",
  reclamo: "Reclamo a la aseguradora",
  pago_adicional: "Pago adicional",
  aceptada: "Diferencia aceptada",
};

/**
 * Registra el seguimiento de un recibo PAGADO (ver registrarAclaracion). Con un pago adicional
 * que ya cuadra con la esperada, o al aceptar la diferencia, el recibo queda CONCILIADO.
 * No verifica sesión ni valida la entrada: quien la invoque (Server Action) debe hacerlo.
 */
export async function registrarSeguimiento(
  reciboId: string,
  { tipo, texto, monto }: { tipo: TipoNota; texto: string; monto: number | null },
  usuario: UsuarioSesion
) {
  const { agenciaId } = usuario;
  return db.$transaction(async (tx) => {
    const recibo = await tx.recibo.findUnique({
      where: { id: reciboId, agenciaId },
      select: {
        ...SELECT_RECIBO_ESPERADA,
        estado: true,
        comision_pagada: true,
        poliza: { select: { ...SELECT_RECIBO_ESPERADA.poliza.select, numeroImpreso: true } },
      },
    });
    if (!recibo) throw new AclaracionError("El recibo ya no existe.");
    if (recibo.estado !== "PAGADO") throw new AclaracionError("Este recibo ya no está pendiente de aclarar; recarga la página.");

    let conciliado = tipo === "aceptada";
    const pagada = Math.round((Number(recibo.comision_pagada ?? 0) + (monto ?? 0)) * 100) / 100;
    if (monto !== null) {
      const esperada = (await comisionesEsperadas(agenciaId, [recibo])).get(recibo.id);
      conciliado = esperada?.esperada != null && Math.abs(pagada - esperada.esperada) <= TOLERANCIA_MXN;
    }
    await tx.recibo.update({
      where: { id: reciboId, agenciaId },
      data: {
        ...(monto !== null && { comision_pagada: pagada.toFixed(2) }),
        ...(conciliado && { estado: "CONCILIADO", conciliado_at: new Date() }),
      },
    });
    await tx.notaAclaracion.create({
      data: {
        agenciaId,
        recibo_id: reciboId,
        usuario_email: usuario.email,
        tipo,
        texto,
        ...(monto !== null && { monto: monto.toFixed(2) }),
      },
    });
    await registrarBitacora(
      usuario,
      {
        accion: `aclaracion.${tipo}`,
        entidad: "recibo",
        entidadId: reciboId,
        descripcion:
          `${ETIQUETA_NOTA[tipo]} · póliza ${recibo.poliza.numeroImpreso} recibo ${recibo.numero}` +
          (monto !== null ? ` · +$${monto.toFixed(2)} (total $${pagada.toFixed(2)})` : "") +
          (conciliado ? " · queda conciliado" : "") +
          `: ${texto}`,
      },
      tx
    );
    return { conciliado };
  });
}
