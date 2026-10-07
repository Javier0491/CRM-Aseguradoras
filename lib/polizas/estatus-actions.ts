"use server";

import { revalidatePath } from "next/cache";

import { alcanceDe, polizasDe } from "@/lib/auth/alcance";
import { getUsuarioCrm, type UsuarioSesion } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import { formatFecha, formatMoneda } from "@/lib/format";
import {
  etiquetaEndoso,
  MOTIVOS_CANCELACION,
  primaEndoso,
  validarEndoso,
  validarFechaCancelacion,
  type EndosoValores,
  type ErroresEndoso,
} from "@/lib/polizas/estatus";

const SESION = "Tu sesión expiró. Vuelve a iniciar sesión.";
const ID = /^[a-z0-9]+$/i;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type EstatusResultado = { ok: true } | { ok: false; error: string };

function revalidar(polizaId: string) {
  revalidatePath("/polizas", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/renovaciones");
  revalidatePath("/");
  revalidatePath(`/polizas/${polizaId}`);
}

async function polizaVisible(user: UsuarioSesion, polizaId: unknown) {
  if (typeof polizaId !== "string" || !ID.test(polizaId)) return null;
  return db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: {
      id: true,
      numeroImpreso: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      canceladaAt: true,
      cliente: { select: { nombre: true } },
    },
  });
}

/**
 * Cancela una póliza sin borrarla: guarda la fecha efectiva y el motivo, y sus recibos pendientes
 * pasan a CANCELADO (ya no se cobran ni generan avisos). Los cobrados se conservan. Se puede
 * deshacer con reactivarPoliza.
 */
export async function cancelarPoliza(
  polizaId: string,
  datos: { fecha: string; motivo: string; detalle?: string }
): Promise<EstatusResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  const poliza = await polizaVisible(user, polizaId);
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };
  if (poliza.canceladaAt) return { ok: false, error: "La póliza ya estaba cancelada." };
  if (typeof datos !== "object" || datos === null) return { ok: false, error: "Datos inválidos." };
  const fecha = typeof datos.fecha === "string" ? datos.fecha : "";
  const errorFecha = validarFechaCancelacion(fecha, { inicio: iso(poliza.vigencia_inicio), fin: iso(poliza.vigencia_fin) });
  if (errorFecha) return { ok: false, error: errorFecha };
  if (!(MOTIVOS_CANCELACION as readonly string[]).includes(datos.motivo)) return { ok: false, error: "Elige el motivo." };
  const detalle = typeof datos.detalle === "string" ? datos.detalle.trim().replace(/\s+/g, " ").slice(0, 300) : "";
  const motivo = detalle ? `${datos.motivo} · ${detalle}` : datos.motivo;

  await db.$transaction(async (tx) => {
    const pendientes = await tx.recibo.findMany({
      where: { agenciaId: user.agenciaId, poliza_id: poliza.id, estado: "PENDIENTE" },
      select: { id: true },
    });
    await tx.recibo.updateMany({
      where: { agenciaId: user.agenciaId, poliza_id: poliza.id, estado: "PENDIENTE" },
      data: { estado: "CANCELADO" },
    });
    await tx.poliza.update({
      where: { id: poliza.id, agenciaId: user.agenciaId },
      data: { canceladaAt: new Date(`${fecha}T00:00:00Z`), motivoCancelacion: motivo },
    });
    await registrarBitacora(
      user,
      {
        accion: "poliza.cancelar",
        entidad: "poliza",
        entidadId: poliza.id,
        descripcion:
          `Canceló la póliza ${poliza.numeroImpreso} (${poliza.cliente.nombre}) a partir del ${formatFecha(`${fecha}T00:00:00Z`)}: ${motivo}` +
          (pendientes.length ? `; ${pendientes.length} ${pendientes.length === 1 ? "recibo pendiente cancelado" : "recibos pendientes cancelados"}` : ""),
        datos: { recibosCancelados: pendientes.map((r) => r.id) },
      },
      tx
    );
  });
  revalidar(poliza.id);
  return { ok: true };
}

/** Deshace la cancelación: la póliza vuelve a estar en vigor y sus recibos cancelados, pendientes. */
export async function reactivarPoliza(polizaId: string): Promise<EstatusResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  const poliza = await polizaVisible(user, polizaId);
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };
  if (!poliza.canceladaAt) return { ok: false, error: "La póliza no está cancelada." };

  await db.$transaction(async (tx) => {
    const { count } = await tx.recibo.updateMany({
      where: { agenciaId: user.agenciaId, poliza_id: poliza.id, estado: "CANCELADO" },
      data: { estado: "PENDIENTE" },
    });
    await tx.poliza.update({
      where: { id: poliza.id, agenciaId: user.agenciaId },
      data: { canceladaAt: null, motivoCancelacion: null },
    });
    await registrarBitacora(
      user,
      {
        accion: "poliza.reactivar",
        entidad: "poliza",
        entidadId: poliza.id,
        descripcion:
          `Reactivó la póliza ${poliza.numeroImpreso} (${poliza.cliente.nombre})` +
          (count ? `; ${count} ${count === 1 ? "recibo vuelve" : "recibos vuelven"} a pendiente` : ""),
      },
      tx
    );
  });
  revalidar(poliza.id);
  return { ok: true };
}

export type EndosoResultado = { ok: true } | { ok: false; error?: string; errores?: ErroresEndoso };

/** Registra un endoso de la póliza (cambio durante la vigencia con su movimiento de prima). */
export async function registrarEndoso(polizaId: string, raw: EndosoValores): Promise<EndosoResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  const poliza = await polizaVisible(user, polizaId);
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Datos inválidos." };
  const valores: EndosoValores = {
    tipo: String(raw.tipo ?? ""),
    fecha: String(raw.fecha ?? ""),
    numero: String(raw.numero ?? "").slice(0, 100),
    descripcion: String(raw.descripcion ?? "").slice(0, 2000),
    prima: String(raw.prima ?? "").slice(0, 30),
  };
  const errores = validarEndoso(valores, { inicio: iso(poliza.vigencia_inicio), fin: iso(poliza.vigencia_fin) });
  if (Object.keys(errores).length > 0) return { ok: false, errores };
  const prima = primaEndoso(valores.prima);

  await db.$transaction(async (tx) => {
    await tx.endoso.create({
      data: {
        agenciaId: user.agenciaId,
        polizaId: poliza.id,
        tipo: valores.tipo,
        fecha: new Date(`${valores.fecha}T00:00:00Z`),
        numero: valores.numero.trim() || null,
        descripcion: valores.descripcion.trim(),
        prima: prima === null ? null : prima.toFixed(2),
        usuarioEmail: user.email,
      },
    });
    await registrarBitacora(
      user,
      {
        accion: "endoso.crear",
        entidad: "poliza",
        entidadId: poliza.id,
        descripcion:
          `Endoso${valores.numero.trim() ? ` ${valores.numero.trim()}` : ""} de la póliza ${poliza.numeroImpreso}: ` +
          `${etiquetaEndoso(valores.tipo)}` +
          (prima === null ? "" : prima < 0 ? ` · devolución de ${formatMoneda(-prima)}` : ` · prima adicional de ${formatMoneda(prima)}`),
      },
      tx
    );
  });
  revalidar(poliza.id);
  return { ok: true };
}

/** Borra un endoso capturado por error. */
export async function eliminarEndoso(endosoId: string): Promise<EstatusResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  if (typeof endosoId !== "string" || !ID.test(endosoId)) return { ok: false, error: "Datos inválidos." };
  const endoso = await db.endoso.findFirst({
    where: { id: endosoId, agenciaId: user.agenciaId, poliza: polizasDe(alcanceDe(user)) },
    select: { id: true, tipo: true, numero: true, polizaId: true, poliza: { select: { numeroImpreso: true } } },
  });
  if (!endoso) return { ok: false, error: "El endoso ya no existe." };
  await db.$transaction(async (tx) => {
    await tx.endoso.delete({ where: { id: endoso.id } });
    await registrarBitacora(
      user,
      {
        accion: "endoso.eliminar",
        entidad: "poliza",
        entidadId: endoso.polizaId,
        descripcion: `Eliminó el endoso${endoso.numero ? ` ${endoso.numero}` : ""} (${etiquetaEndoso(endoso.tipo)}) de la póliza ${endoso.poliza.numeroImpreso}`,
      },
      tx
    );
  });
  revalidar(endoso.polizaId);
  return { ok: true };
}
