// Matriz de avisos automáticos por aseguradora (compartida por el formulario, la Server Action
// y el envío programado).

export const TIPOS_AVISO = [
  {
    clave: "por_vencer",
    campo: "avisoDiasAntes",
    titulo: "Recibo por vencer",
    ayuda: "Días antes del vencimiento",
  },
  {
    clave: "vencido",
    campo: "avisoDiasVencido",
    titulo: "Recibo vencido",
    ayuda: "Días después del vencimiento",
  },
  {
    clave: "renovacion",
    campo: "avisoDiasRenovacion",
    titulo: "Renovación próxima",
    ayuda: "Días antes del fin de vigencia",
  },
] as const;

export type TipoAviso = (typeof TIPOS_AVISO)[number]["clave"];
export type CampoAviso = (typeof TIPOS_AVISO)[number]["campo"];
/** Días de cada aviso de una aseguradora; null = ese aviso no se envía. */
export type DiasAviso = Record<CampoAviso, number | null>;

export const MIN_DIAS_AVISO = 1;
export const MAX_DIAS_AVISO = 90;

export const diasAvisoValidos = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= MIN_DIAS_AVISO && v <= MAX_DIAS_AVISO);
