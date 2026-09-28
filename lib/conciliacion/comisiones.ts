// Reglas de negocio de la comisión esperada (funciones puras, sin base de datos).

import { edadEnRango, esTodasLasEdades } from "@/lib/comisiones/reglas";

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Año de la póliza en una fecha: 1 durante los primeros 12 meses desde la primera vigencia
 * de la cadena (misma póliza vigor), 2 en la primera renovación, etc.
 */
export function anioDePoliza(primeraVigencia: Date, fecha: Date): number {
  let anios = fecha.getUTCFullYear() - primeraVigencia.getUTCFullYear();
  const antesDelAniversario =
    fecha.getUTCMonth() < primeraVigencia.getUTCMonth() ||
    (fecha.getUTCMonth() === primeraVigencia.getUTCMonth() && fecha.getUTCDate() < primeraVigencia.getUTCDate());
  if (antesDelAniversario) anios -= 1;
  return Math.max(1, anios + 1);
}

/**
 * Porcentaje del esquema para un año: el del mayor año definido que no lo exceda.
 * Así un único renglón de año 1 es un porcentaje fijo. null si no hay ninguno aplicable.
 */
export function porcentajeDeEsquema(
  esquemas: readonly { anio_poliza: number; porcentaje: number }[],
  anio: number
): { porcentaje: number; anioAplicado: number } | null {
  const aplicable = esquemas
    .filter((e) => e.anio_poliza <= anio)
    .sort((a, b) => b.anio_poliza - a.anio_poliza)[0];
  return aplicable ? { porcentaje: aplicable.porcentaje, anioAplicado: aplicable.anio_poliza } : null;
}

export type PorcentajeAplicado = { valor: number; origen: "personalizado" | "esquema"; anio: number | null };

export type EsquemaResolucion = {
  ramo: string;
  anio_poliza: number;
  porcentaje: number;
  edad_minima: number | null;
  edad_maxima: number | null;
};

const rangoDe = (e: EsquemaResolucion) => ({ edadMinima: e.edad_minima, edadMaxima: e.edad_maxima });

/**
 * Regla única del porcentaje de comisión de un recibo (la usan la conciliación y el dashboard):
 * el % personalizado de la póliza manda; si no hay, la matriz de la aseguradora por ramo y año.
 * Si la edad del titular cae en el rango de alguna regla, esas reglas tienen prioridad; si no
 * (o si la edad se desconoce), se usan las que aplican a todas las edades.
 */
export function resolverPorcentaje(
  poliza: { personalizado: number | null; ramo: string },
  anio: number,
  edad: number | null,
  esquemasAseguradora: readonly EsquemaResolucion[]
): PorcentajeAplicado | null {
  if (poliza.personalizado !== null) return { valor: poliza.personalizado, origen: "personalizado", anio: null };
  const delRamo = esquemasAseguradora.filter((e) => e.ramo === poliza.ramo);
  const porEdad =
    edad === null ? [] : delRamo.filter((e) => !esTodasLasEdades(rangoDe(e)) && edadEnRango(edad, rangoDe(e)));
  const aplicado =
    porcentajeDeEsquema(porEdad, anio) ??
    porcentajeDeEsquema(
      delRamo.filter((e) => esTodasLasEdades(rangoDe(e))),
      anio
    );
  return aplicado ? { valor: aplicado.porcentaje, origen: "esquema", anio } : null;
}

/**
 * Edad del titular en una fecha: por su fecha de nacimiento si se capturó; si no, la edad
 * impresa en la carátula. Sin titular marcado se toma el primer asegurado. null si no hay dato.
 */
export function edadDelTitular(
  asegurados: readonly { parentesco: string; orden: number; edad: number | null; fecha_nacimiento: string | null }[],
  fecha: Date
): number | null {
  const ordenados = [...asegurados].sort((a, b) => a.orden - b.orden);
  const titular = ordenados.find((a) => a.parentesco.toLowerCase() === "titular") ?? ordenados[0];
  if (!titular) return null;
  const nacimiento = titular.fecha_nacimiento?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (nacimiento) {
    const [anio, mes, dia] = nacimiento.slice(1).map(Number);
    let edad = fecha.getUTCFullYear() - anio;
    if (fecha.getUTCMonth() + 1 < mes || (fecha.getUTCMonth() + 1 === mes && fecha.getUTCDate() < dia)) edad -= 1;
    if (edad >= 0 && edad <= 130) return edad;
  }
  return titular.edad;
}

export const comisionEsperada = (montoRecibo: number, porcentaje: number) =>
  redondear((montoRecibo * porcentaje) / 100);

/**
 * Monto de una celda del estado de cuenta: acepta números, "$1,234.56", "1234.5 MXN" y
 * negativos contables "(1,234.56)". NaN si no es un monto.
 */
export function leerMonto(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? redondear(valor) : NaN;
  if (typeof valor !== "string") return NaN;
  let v = valor.trim();
  if (!v) return NaN;
  const negativoContable = /^\(.*\)$/.test(v);
  v = v.replace(/[()$,\s]|MXN|USD/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(v)) return NaN;
  const n = Number(v);
  return redondear(negativoContable ? -Math.abs(n) : n);
}
