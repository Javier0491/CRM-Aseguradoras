// Reglas de negocio de la comisión esperada (funciones puras, sin base de datos).

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
