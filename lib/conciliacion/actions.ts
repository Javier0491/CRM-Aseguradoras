"use server";

import { revalidatePath } from "next/cache";

import { getAdmin, getCurrentUser } from "@/lib/auth/dal";
import { agruparPorFolio } from "@/lib/conciliacion/agrupar";
import { aplicarResultados, cruzarEstadoDeCuenta } from "@/lib/conciliacion/motor";
import { MAX_FILAS_ESTADO, type AnalisisResultado, type FilaEstado } from "@/lib/conciliacion/tipos";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

/** Mayor monto que cabe en las columnas Decimal(14, 2). */
const MAX_MONTO = 999_999_999_999.99;
const FOLIO = /^[A-Z0-9][A-Z0-9-]{0,39}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v: string) => FECHA.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** Valida la forma de los renglones que manda el navegador (las Server Actions son públicas). */
function sanitizarFilas(raw: unknown): FilaEstado[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILAS_ESTADO) return null;
  const filas: FilaEstado[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { fila, poliza, comisionPagada, recibo, folio, fecha } = item as Record<string, unknown>;
    if (typeof fila !== "number" || typeof poliza !== "string" || typeof comisionPagada !== "number") return null;
    if (!Number.isFinite(comisionPagada) || Math.abs(comisionPagada) > MAX_MONTO || !poliza.trim()) return null;
    if (recibo !== undefined && (typeof recibo !== "number" || !Number.isInteger(recibo) || recibo < 1 || recibo > 999)) {
      return null;
    }
    if (folio !== undefined && (typeof folio !== "string" || !FOLIO.test(folio))) return null;
    if (fecha !== undefined && (typeof fecha !== "string" || !fechaValida(fecha))) return null;
    filas.push({
      fila,
      poliza: poliza.trim().slice(0, 60),
      // Centavos exactos: evita que 1520.4999999 se guarde distinto de lo que se mostró.
      comisionPagada: Math.round(comisionPagada * 100) / 100,
      ...(recibo !== undefined && { recibo }),
      ...(folio !== undefined && { folio: folio.toUpperCase() }),
      ...(fecha !== undefined && { fecha }),
    });
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
  // El navegador ya agrupa los folios repetidos; se repite aquí porque no se confía en él.
  return { ok: true, aseguradoraId: aseguradora.id, filas: agruparPorFolio(filas).filas };
}

/** Cruza el estado de cuenta contra la base de datos sin modificar nada. */
export async function analizarConciliacion(aseguradoraId: string, filas: FilaEstado[]): Promise<AnalisisResultado> {
  const v = await validar(aseguradoraId, filas);
  if (!v.ok) return { ok: false, error: v.error };
  const { resultados, resumen } = await cruzarEstadoDeCuenta(v.aseguradoraId, v.filas);
  return { ok: true, resultados, resumen };
}

export type AplicarResultado =
  | { ok: true; conciliados: number; pagados: number; creados: number }
  | { ok: false; error: string };

/**
 * Aplica el cruce (ver aplicarResultados): concilia los matches exactos, registra como PAGADO
 * los cobrados con diferencia de comisión y crea los que no existían. El cruce se recalcula
 * aquí: no se confía en el resultado que muestra el navegador, que pudo quedar desactualizado.
 */
export async function aplicarConciliacion(aseguradoraId: string, filas: FilaEstado[]): Promise<AplicarResultado> {
  const v = await validar(aseguradoraId, filas);
  if (!v.ok) return { ok: false, error: v.error };

  const { resultados } = await cruzarEstadoDeCuenta(v.aseguradoraId, v.filas);
  try {
    const { conciliados, pagados, creados } = await aplicarResultados(resultados);

    revalidatePath("/");
    // Listado y detalle de cada póliza: su avance de recibos cambió.
    revalidatePath("/polizas", "layout");
    revalidatePath("/conciliacion");
    return { ok: true, conciliados, pagados, creados };
  } catch (e) {
    // Otro proceso creó el mismo recibo o folio entre el cruce y la escritura: nada se guardó.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Algunos recibos cambiaron mientras se aplicaba. Vuelve a analizar el cruce." };
    }
    console.error("[aplicarConciliacion]", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo aplicar la conciliación; no se guardó ningún cambio." };
  }
}
