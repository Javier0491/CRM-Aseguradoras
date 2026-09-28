"use server";

import { revalidatePath } from "next/cache";

import { getAdmin, getCurrentUser } from "@/lib/auth/dal";
import { cruzarEstadoDeCuenta } from "@/lib/conciliacion/motor";
import { MAX_FILAS_ESTADO, type AnalisisResultado, type FilaEstado } from "@/lib/conciliacion/tipos";
import { db } from "@/lib/db";

/** Valida la forma de los renglones que manda el navegador (las Server Actions son públicas). */
function sanitizarFilas(raw: unknown): FilaEstado[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILAS_ESTADO) return null;
  const filas: FilaEstado[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { fila, poliza, comisionPagada, recibo } = item as Record<string, unknown>;
    if (typeof fila !== "number" || typeof poliza !== "string" || typeof comisionPagada !== "number") return null;
    if (!Number.isFinite(comisionPagada) || !poliza.trim()) return null;
    if (recibo !== undefined && (typeof recibo !== "number" || !Number.isInteger(recibo))) return null;
    filas.push({ fila, poliza: poliza.trim().slice(0, 60), comisionPagada, ...(recibo !== undefined && { recibo }) });
  }
  return filas;
}

type Validacion = { ok: true; aseguradoraId: string; filas: FilaEstado[] } | { ok: false; error: string };

async function validar(aseguradoraId: unknown, rawFilas: unknown): Promise<Validacion> {
  if (!(await getAdmin())) {
    return (await getCurrentUser())
      ? { ok: false, error: "Solo un administrador puede conciliar comisiones." }
      : { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }
  if (typeof aseguradoraId !== "string") return { ok: false, error: "Selecciona la aseguradora." };
  const aseguradora = await db.aseguradora.findUnique({ where: { id: aseguradoraId }, select: { id: true } });
  if (!aseguradora) return { ok: false, error: "La aseguradora no existe." };
  const filas = sanitizarFilas(rawFilas);
  if (!filas) return { ok: false, error: `El archivo no tiene renglones válidos (máximo ${MAX_FILAS_ESTADO}).` };
  return { ok: true, aseguradoraId: aseguradora.id, filas };
}

/** Cruza el estado de cuenta contra la base de datos sin modificar nada. */
export async function analizarConciliacion(aseguradoraId: string, filas: FilaEstado[]): Promise<AnalisisResultado> {
  const v = await validar(aseguradoraId, filas);
  if (!v.ok) return { ok: false, error: v.error };
  const { resultados, resumen } = await cruzarEstadoDeCuenta(v.aseguradoraId, v.filas);
  return { ok: true, resultados, resumen };
}

export type AplicarResultado = { ok: true; conciliados: number } | { ok: false; error: string };

/**
 * Marca como CONCILIADOS los recibos con match exacto. El cruce se recalcula aquí: no se
 * confía en el resultado que muestra el navegador, que pudo quedar desactualizado.
 */
export async function aplicarConciliacion(aseguradoraId: string, filas: FilaEstado[]): Promise<AplicarResultado> {
  const v = await validar(aseguradoraId, filas);
  if (!v.ok) return { ok: false, error: v.error };

  const { resultados } = await cruzarEstadoDeCuenta(v.aseguradoraId, v.filas);
  const aplicar = resultados.filter((r) => r.estatus === "conciliado" && r.recibo);
  if (aplicar.length === 0) return { ok: true, conciliados: 0 };

  const ahora = new Date();
  const actualizados = await db.$transaction(
    aplicar.map((r) =>
      // El filtro por estado evita conciliar dos veces si otra persona lo hizo en paralelo.
      db.recibo.updateMany({
        where: { id: r.recibo!.id, estado: { not: "CONCILIADO" } },
        data: { estado: "CONCILIADO", comision_pagada: r.comisionPagada.toFixed(2), conciliado_at: ahora },
      })
    )
  );

  revalidatePath("/");
  revalidatePath("/polizas");
  revalidatePath("/conciliacion");
  return { ok: true, conciliados: actualizados.reduce((n, u) => n + u.count, 0) };
}
