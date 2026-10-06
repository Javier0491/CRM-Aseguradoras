// Embudo de renovaciones: columnas, motivos de pérdida y urgencia (funciones puras, compartidas
// por cliente y servidor).

/** Días hacia adelante que cubre el embudo (pólizas que vencen pronto). */
export const DIAS_EMBUDO = 60;
/** Días hacia atrás: pólizas ya vencidas que aún se pueden renovar o recuperar. */
export const DIAS_VENCIDAS_EMBUDO = 30;
/** Las que están en seguimiento (cotizando, enviada, perdida) siguen visibles hasta este plazo. */
export const DIAS_SEGUIMIENTO = 90;

export const COLUMNAS_EMBUDO = [
  { clave: "por_renovar", titulo: "Por renovar", descripcion: "Sin gestionar todavía" },
  { clave: "cotizando", titulo: "Cotizando", descripcion: "Preparando la propuesta" },
  { clave: "enviada", titulo: "Enviada", descripcion: "Propuesta con el cliente" },
  { clave: "renovada", titulo: "Renovada", descripcion: "Renovación capturada" },
  { clave: "perdida", titulo: "Perdida", descripcion: "No se renovó" },
] as const;
export type ColumnaEmbudo = (typeof COLUMNAS_EMBUDO)[number]["clave"];

/** Etapas que se pueden elegir a mano ("renovada" sale de capturar la renovación). */
export const ETAPAS_MANUALES = ["por_renovar", "cotizando", "enviada", "perdida"] as const;
export type EtapaManual = (typeof ETAPAS_MANUALES)[number];
export const esEtapaManual = (v: unknown): v is EtapaManual =>
  typeof v === "string" && (ETAPAS_MANUALES as readonly string[]).includes(v);

/** Valor de la base de datos (enum EtapaRenovacion) de cada etapa manual; null = por renovar. */
export const ETAPA_DB = {
  por_renovar: null,
  cotizando: "COTIZANDO",
  enviada: "ENVIADA",
  perdida: "PERDIDA",
} as const satisfies Record<EtapaManual, string | null>;

export const MOTIVOS_PERDIDA = [
  "Precio",
  "Se fue con otro agente",
  "Cambió de aseguradora",
  "Ya no necesita el seguro",
  "Sin respuesta del cliente",
  "Otro",
] as const;

/**
 * Columna de una póliza en el embudo. Renovada manda (su renovación ya está capturada aunque se
 * hubiera marcado otra etapa); si no, la etapa guardada; sin etapa, "por renovar".
 */
export function columnaDe(p: { renovada: boolean; etapa: "COTIZANDO" | "ENVIADA" | "PERDIDA" | null }): ColumnaEmbudo {
  if (p.renovada) return "renovada";
  if (p.etapa === "COTIZANDO") return "cotizando";
  if (p.etapa === "ENVIADA") return "enviada";
  if (p.etapa === "PERDIDA") return "perdida";
  return "por_renovar";
}

export type Urgencia = "vencida" | "critica" | "pronto" | "a_tiempo";

/** Urgencia según los días que faltan para el fin de vigencia (negativo = ya venció). */
export function urgenciaRenovacion(dias: number): Urgencia {
  if (dias < 0) return "vencida";
  if (dias <= 15) return "critica";
  if (dias <= 30) return "pronto";
  return "a_tiempo";
}

/** Nota guardada al marcar perdida: "Motivo · detalle". */
export function notaDePerdida(motivo: string, detalle: string): string {
  const limpio = detalle.trim().replace(/\s+/g, " ").slice(0, 300);
  return limpio ? `${motivo} · ${limpio}` : motivo;
}
