// Filtro de periodo de Reportes. A diferencia del dashboard incluye "Histórico" (sin límite de
// fechas); vive en la URL (?periodo=…) igual que el filtro del dashboard.

import { rangoDePeriodo, type Rango } from "@/lib/dashboard/periodos";

export const PERIODOS_REPORTE = [
  { value: "mes", label: "Este mes" },
  { value: "anio", label: "Año actual" },
  { value: "historico", label: "Histórico" },
] as const;
export type PeriodoReporte = (typeof PERIODOS_REPORTE)[number]["value"];

export const PERIODO_REPORTE_PREDETERMINADO: PeriodoReporte = "mes";

export const esPeriodoReporte = (v: unknown): v is PeriodoReporte =>
  typeof v === "string" && PERIODOS_REPORTE.some((p) => p.value === v);

/** Rango del periodo hasta hoy (inclusive); null en "Histórico", que no filtra por fecha. */
export function rangoReporte(periodo: PeriodoReporte, hoyIso: string): Rango | null {
  return periodo === "historico" ? null : rangoDePeriodo(periodo, hoyIso).actual;
}
