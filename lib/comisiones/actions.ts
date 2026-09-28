"use server";

import { revalidatePath } from "next/cache";

import { getAdmin, getCurrentUser } from "@/lib/auth/dal";
import {
  claveRango,
  esTodasLasEdades,
  MAX_ANIO_POLIZA,
  MAX_EDAD,
  rangosSeTraslapan,
  textoRangoEdad,
} from "@/lib/comisiones/reglas";
import { db } from "@/lib/db";
import { Prisma, Ramo } from "@/lib/generated/prisma/client";

export type EsquemaInput = {
  id?: string;
  aseguradoraId: string;
  ramo: string;
  anio: number;
  porcentaje: number;
  /** null = sin límite (en blanco en el formulario). */
  edadMinima: number | null;
  edadMaxima: number | null;
};

export type ResultadoEsquema = { ok: true } | { ok: false; error: string; campo?: keyof EsquemaInput };

function validar(raw: unknown): { ok: true; datos: EsquemaInput & { ramo: Ramo } } | { ok: false; error: string; campo?: keyof EsquemaInput } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Datos inválidos." };
  const { id, aseguradoraId, ramo, anio, porcentaje, edadMinima, edadMaxima } = raw as Record<string, unknown>;
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
  const edadValida = (v: unknown): v is number | null =>
    v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_EDAD);
  if (!edadValida(edadMinima)) {
    return { ok: false, error: `La edad mínima debe ser un entero entre 0 y ${MAX_EDAD}, o quedar en blanco.`, campo: "edadMinima" };
  }
  if (!edadValida(edadMaxima)) {
    return { ok: false, error: `La edad máxima debe ser un entero entre 0 y ${MAX_EDAD}, o quedar en blanco.`, campo: "edadMaxima" };
  }
  if (edadMinima !== null && edadMaxima !== null && edadMinima > edadMaxima) {
    return { ok: false, error: "La edad mínima no puede ser mayor que la máxima.", campo: "edadMaxima" };
  }
  return { ok: true, datos: { id, aseguradoraId, ramo: ramo as Ramo, anio, porcentaje, edadMinima, edadMaxima } };
}

const SIN_PERMISO = "Solo un administrador puede modificar la matriz de comisiones.";

async function verificarAdmin(): Promise<ResultadoEsquema | null> {
  if (await getAdmin()) return null;
  return {
    ok: false,
    error: (await getCurrentUser()) ? SIN_PERMISO : "Tu sesión expiró. Vuelve a iniciar sesión.",
  };
}

function revalidar() {
  revalidatePath("/configuracion/comisiones");
  // La matriz cambia los montos esperados del dashboard y de la conciliación.
  revalidatePath("/");
  revalidatePath("/conciliacion");
}

/**
 * Una regla choca con otra de la misma aseguradora y ramo si tiene el mismo año y el mismo
 * rango de edad, o si su rango se traslapa con otro rango distinto: para una edad del
 * traslape no se sabría qué tabla usar. "Todas las edades" es el respaldo y no se traslapa.
 */
function conflictoDeRango(
  rango: { edadMinima: number | null; edadMaxima: number | null },
  anio: number,
  otras: { anio_poliza: number; edad_minima: number | null; edad_maxima: number | null }[]
): ResultadoEsquema | null {
  for (const o of otras) {
    const rangoOtra = { edadMinima: o.edad_minima, edadMaxima: o.edad_maxima };
    const texto = textoRangoEdad(rangoOtra) ?? "todas las edades";
    if (claveRango(rangoOtra) === claveRango(rango)) {
      if (o.anio_poliza === anio) {
        return { ok: false, error: `Ya existe una regla para ese ramo, año ${anio} y ${texto} en esta aseguradora.`, campo: "anio" };
      }
      continue;
    }
    if (!esTodasLasEdades(rango) && !esTodasLasEdades(rangoOtra) && rangosSeTraslapan(rango, rangoOtra)) {
      return {
        ok: false,
        error: `El rango de edad se traslapa con otra regla de este ramo (${texto}). Usa el mismo rango o uno que no se traslape.`,
        campo: "edadMinima",
      };
    }
  }
  return null;
}

/** Crea o actualiza una regla de la matriz de comisiones. */
export async function guardarEsquema(raw: EsquemaInput): Promise<ResultadoEsquema> {
  const acceso = await verificarAdmin();
  if (acceso) return acceso;
  const v = validar(raw);
  if (!v.ok) return v;
  const { id, aseguradoraId, ramo, anio, porcentaje, edadMinima, edadMaxima } = v.datos;
  const rango = { edadMinima, edadMaxima };

  const aseguradora = await db.aseguradora.findUnique({ where: { id: aseguradoraId }, select: { id: true } });
  if (!aseguradora) return { ok: false, error: "La aseguradora no existe.", campo: "aseguradoraId" };

  const data = {
    aseguradora_id: aseguradoraId,
    ramo,
    anio_poliza: anio,
    porcentaje: porcentaje.toFixed(2),
    edad_minima: edadMinima,
    edad_maxima: edadMaxima,
  };
  try {
    // Serializable: la validación contra las demás reglas y el guardado ocurren como una sola
    // operación, así dos personas no pueden crear a la vez reglas que choquen.
    const conflicto = await db.$transaction(
      async (tx) => {
        const otras = await tx.esquemaComision.findMany({
          where: { aseguradora_id: aseguradoraId, ramo, ...(id ? { id: { not: id } } : {}) },
          select: { anio_poliza: true, edad_minima: true, edad_maxima: true },
        });
        const conflicto = conflictoDeRango(rango, anio, otras);
        if (conflicto) return conflicto;
        if (id) await tx.esquemaComision.update({ where: { id }, data });
        else await tx.esquemaComision.create({ data });
        return null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if (conflicto) return conflicto;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "La regla ya no existe; recarga la página." };
      if (e.code === "P2034") return { ok: false, error: "Otra persona modificó la matriz al mismo tiempo. Intenta de nuevo." };
    }
    console.error("[guardarEsquema]", e);
    return { ok: false, error: "No se pudo guardar la regla." };
  }
  revalidar();
  return { ok: true };
}

export async function eliminarEsquema(id: string): Promise<ResultadoEsquema> {
  const acceso = await verificarAdmin();
  if (acceso) return acceso;
  if (typeof id !== "string" || !id) return { ok: false, error: "Datos inválidos." };
  // deleteMany: si otra persona ya la borró no es un error.
  await db.esquemaComision.deleteMany({ where: { id } });
  revalidar();
  return { ok: true };
}
