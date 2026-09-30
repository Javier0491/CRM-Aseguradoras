// Situación de cobro de un recibo pendiente según los días de gracia de su aseguradora.
// Compartido por la campana, las tablas de recibos y los avisos de cobranza.

/** Máximo configurable en Reglas de cobranza. */
export const MAX_DIAS_GRACIA = 120;

const DIA_MS = 86_400_000;

/**
 * - por_vencer: aún no llega la fecha de pago.
 * - gracia: ya venció, pero sigue dentro de los días de gracia de la aseguradora.
 * - riesgo: pasó el plazo de gracia (o la aseguradora no da gracia): la póliza puede cancelarse.
 */
export type SituacionCobro = "por_vencer" | "gracia" | "riesgo";

/** Fecha (YYYY-MM-DD) desplazada `dias` días. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

/**
 * Situación de un recibo pendiente al día `hoy` (fechas YYYY-MM-DD). `fechaLimite` es el último
 * día para pagar (vencimiento + gracia) y `diasRestantes`, los días que faltan para él
 * (negativo si ya pasó).
 */
export function situacionCobro(vencimiento: string, diasGracia: number, hoy: string) {
  const fechaLimite = sumarDias(vencimiento, diasGracia);
  const diasRestantes = diasEntre(hoy, fechaLimite);
  const situacion: SituacionCobro =
    vencimiento >= hoy ? "por_vencer" : fechaLimite >= hoy ? "gracia" : "riesgo";
  return { situacion, fechaLimite, diasRestantes };
}
