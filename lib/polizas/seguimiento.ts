// Qué recibos pendientes llevan seguimiento de cobranza. Al cargar pólizas pasadas o ya renovadas,
// sus recibos quedan pendientes; sin esta regla todos aparecerían como vencidos.
import type { Prisma } from "@/lib/generated/prisma/client";

import { sumarDias } from "@/lib/polizas/gracia";

/**
 * Días antes de la captura a partir de los cuales un recibo ya vencido es histórico. El margen
 * deja en seguimiento el primer recibo de una póliza nueva que se capturó unos días tarde.
 */
export const MARGEN_HISTORICO_DIAS = 30;

/** Un recibo es histórico si venció más de 30 días antes de capturar la póliza (fechas YYYY-MM-DD). */
export const esHistorico = (vencimiento: string, capturada: string) =>
  vencimiento < sumarDias(capturada, -MARGEN_HISTORICO_DIAS);

/**
 * Recibos pendientes con seguimiento: de pólizas vigentes y no canceladas, y que no son
 * históricos. Lo usan "Vencidos", "Pendientes", el riesgo de cancelación y los avisos del día.
 */
export const enSeguimiento = (hoy: Date): Prisma.ReciboWhereInput => ({
  estado: "PENDIENTE",
  historico: false,
  poliza: { canceladaAt: null, vigencia_fin: { gte: hoy } },
});

/**
 * Recibo pendiente sin seguimiento: histórico o de una póliza cuya vigencia ya terminó. En las
 * tablas se muestra atenuado como "Histórico", sin días vencidos ni riesgo de cancelación.
 */
export const sinSeguimiento = (
  recibo: { estado: string; historico: boolean },
  poliza: { vigencia_fin: Date; canceladaAt?: Date | null },
  hoy: string
) =>
  recibo.estado === "PENDIENTE" &&
  (recibo.historico || poliza.canceladaAt != null || poliza.vigencia_fin.toISOString().slice(0, 10) < hoy);
