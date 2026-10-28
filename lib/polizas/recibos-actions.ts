"use server";

import { revalidatePath } from "next/cache";

import { alcanceDe, polizasDe } from "@/lib/auth/alcance";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";

const ID = /^[a-z0-9]+$/i;
const MAX_RECIBOS = 500;

export type MarcarRecibosResultado = { ok: true; cambiados: number } | { ok: false; error: string };

/**
 * Marca recibos pendientes como pagados a mano (`pagado`) o los regresa a pendiente. Sirve para
 * lo cobrado fuera de la conciliación; un estado de cuenta que después reporte el recibo por su
 * número lo concilia igual. Solo toca recibos de pólizas que el usuario puede ver.
 */
export async function marcarRecibosPagados(ids: string[], pagado: boolean): Promise<MarcarRecibosResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_RECIBOS || !ids.every((id) => typeof id === "string" && ID.test(id))) {
    return { ok: false, error: "Datos inválidos." };
  }
  const desde = pagado ? "PENDIENTE" : "PAGADO_MANUAL";
  const recibos = await db.recibo.findMany({
    where: { id: { in: ids }, agenciaId: user.agenciaId, estado: desde, poliza: polizasDe(alcanceDe(user)) },
    select: { id: true, numero: true, poliza: { select: { id: true, numeroImpreso: true, cliente: { select: { nombre: true } } } } },
  });
  if (recibos.length === 0) return { ok: false, error: "Los recibos ya cambiaron; recarga la página." };

  const porPoliza = new Map<string, typeof recibos>();
  for (const r of recibos) porPoliza.set(r.poliza.id, [...(porPoliza.get(r.poliza.id) ?? []), r]);
  await db.$transaction(async (tx) => {
    // El filtro por estado evita pisar una conciliación que ocurrió en paralelo.
    await tx.recibo.updateMany({
      where: { id: { in: recibos.map((r) => r.id) }, agenciaId: user.agenciaId, estado: desde },
      data: { estado: pagado ? "PAGADO_MANUAL" : "PENDIENTE" },
    });
    for (const [polizaId, deLaPoliza] of porPoliza) {
      const { numeroImpreso, cliente } = deLaPoliza[0].poliza;
      const numeros = deLaPoliza.map((r) => r.numero).sort((a, b) => a - b).join(", ");
      await registrarBitacora(
        user,
        {
          accion: pagado ? "recibo.pagado_manual" : "recibo.desmarcar_pagado",
          entidad: "poliza",
          entidadId: polizaId,
          descripcion: pagado
            ? `Marcó como pagados a mano los recibos ${numeros} de la póliza ${numeroImpreso} (${cliente.nombre})`
            : `Regresó a pendiente los recibos ${numeros} de la póliza ${numeroImpreso} (${cliente.nombre})`,
          datos: { recibos: deLaPoliza.map((r) => r.id) },
        },
        tx
      );
    }
  });
  revalidatePath("/polizas", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/");
  return { ok: true, cambiados: recibos.length };
}
