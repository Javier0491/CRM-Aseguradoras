"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/dal";
import { MAX_ANIO_POLIZA } from "@/lib/comisiones/reglas";
import { db } from "@/lib/db";
import { Prisma, Ramo } from "@/lib/generated/prisma/client";

export type EsquemaInput = {
  id?: string;
  aseguradoraId: string;
  ramo: string;
  anio: number;
  porcentaje: number;
};

export type ResultadoEsquema = { ok: true } | { ok: false; error: string; campo?: keyof EsquemaInput };

function validar(raw: unknown): { ok: true; datos: EsquemaInput & { ramo: Ramo } } | { ok: false; error: string; campo?: keyof EsquemaInput } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Datos inválidos." };
  const { id, aseguradoraId, ramo, anio, porcentaje } = raw as Record<string, unknown>;
  if (id !== undefined && typeof id !== "string") return { ok: false, error: "Datos inválidos." };
  if (typeof aseguradoraId !== "string" || !aseguradoraId) {
    return { ok: false, error: "Selecciona la aseguradora.", campo: "aseguradoraId" };
  }
  if (typeof ramo !== "string" || !(Object.values(Ramo) as string[]).includes(ramo)) {
    return { ok: false, error: "Selecciona el ramo.", campo: "ramo" };
  }
  if (typeof anio !== "number" || !Number.isInteger(anio) || anio < 1 || anio > MAX_ANIO_POLIZA) {
    return { ok: false, error: `El año debe ser un entero entre 1 y ${MAX_ANIO_POLIZA}.`, campo: "anio" };
  }
  if (
    typeof porcentaje !== "number" ||
    !Number.isFinite(porcentaje) ||
    porcentaje <= 0 ||
    porcentaje > 100 ||
    Math.round(porcentaje * 100) / 100 !== porcentaje
  ) {
    return { ok: false, error: "El porcentaje debe ser mayor a 0 y hasta 100, con máximo dos decimales.", campo: "porcentaje" };
  }
  return { ok: true, datos: { id, aseguradoraId, ramo: ramo as Ramo, anio, porcentaje } };
}

function revalidar() {
  revalidatePath("/configuracion/comisiones");
  // La matriz cambia los montos esperados del dashboard y de la conciliación.
  revalidatePath("/");
  revalidatePath("/conciliacion");
}

/** Crea o actualiza una regla de la matriz de comisiones. */
export async function guardarEsquema(raw: EsquemaInput): Promise<ResultadoEsquema> {
  if (!(await getCurrentUser())) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const v = validar(raw);
  if (!v.ok) return v;
  const { id, aseguradoraId, ramo, anio, porcentaje } = v.datos;

  const aseguradora = await db.aseguradora.findUnique({ where: { id: aseguradoraId }, select: { id: true } });
  if (!aseguradora) return { ok: false, error: "La aseguradora no existe.", campo: "aseguradoraId" };

  const data = { aseguradora_id: aseguradoraId, ramo, anio_poliza: anio, porcentaje: porcentaje.toFixed(2) };
  try {
    if (id) await db.esquemaComision.update({ where: { id }, data });
    else await db.esquemaComision.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return { ok: false, error: `Ya existe una regla para ese ramo y año ${anio} en esta aseguradora.`, campo: "anio" };
      }
      if (e.code === "P2025") return { ok: false, error: "La regla ya no existe; recarga la página." };
    }
    console.error("[guardarEsquema]", e);
    return { ok: false, error: "No se pudo guardar la regla." };
  }
  revalidar();
  return { ok: true };
}

export async function eliminarEsquema(id: string): Promise<ResultadoEsquema> {
  if (!(await getCurrentUser())) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof id !== "string" || !id) return { ok: false, error: "Datos inválidos." };
  // deleteMany: si otra persona ya la borró no es un error.
  await db.esquemaComision.deleteMany({ where: { id } });
  revalidar();
  return { ok: true };
}
