// Periodos del filtro global del dashboard. Las fechas se calculan en la zona horaria de
// México y se expresan como medianoche UTC, igual que las columnas @db.Date.

export const PERIODOS = [
  { value: "mes", label: "Este mes" },
  { value: "trimestre", label: "Último trimestre" },
  { value: "anio", label: "Año actual" },
] as const;
export type Periodo = (typeof PERIODOS)[number]["value"];

export const PERIODO_PREDETERMINADO: Periodo = "mes";

export const esPeriodo = (v: unknown): v is Periodo =>
  typeof v === "string" && PERIODOS.some((p) => p.value === v);

export type Rango = { desde: Date; hasta: Date };

const utc = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes, dia));

/** Misma fecha `meses` antes; si el día no existe en ese mes (31 → junio), el último día del mes. */
function restarMeses(fecha: Date, meses: number) {
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth() - meses;
  const ultimoDia = utc(anio, mes + 1, 0).getUTCDate();
  return utc(anio, mes, Math.min(fecha.getUTCDate(), ultimoDia));
}

const MESES_POR_PERIODO: Record<Periodo, number> = { mes: 1, trimestre: 3, anio: 12 };

/**
 * Rango del periodo hasta hoy (inclusive) y el mismo tramo del periodo anterior, para
 * calcular variaciones (p. ej. 1–24 sep contra 1–24 ago).
 *   mes:       del día 1 del mes actual a hoy
 *   trimestre: los últimos 3 meses contando el actual (del día 1 de hace dos meses a hoy)
 *   anio:      del 1 de enero a hoy
 */
export function rangoDePeriodo(periodo: Periodo, hoyIso: string): { actual: Rango; anterior: Rango } {
  const [anio, mes, dia] = hoyIso.split("-").map(Number);
  const hasta = utc(anio, mes - 1, dia);
  const desde =
    periodo === "mes" ? utc(anio, mes - 1, 1) : periodo === "trimestre" ? utc(anio, mes - 3, 1) : utc(anio, 0, 1);

  const meses = MESES_POR_PERIODO[periodo];
  return {
    actual: { desde, hasta },
    anterior: { desde: restarMeses(desde, meses), hasta: restarMeses(hasta, meses) },
  };
}
