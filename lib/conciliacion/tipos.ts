// Tipos de la conciliación de estados de cuenta de comisiones, compartidos por cliente y servidor.

/** Un renglón del estado de cuenta, ya leído del archivo con el mapeo de columnas. */
export type FilaEstado = {
  /** Número de fila en el archivo (para ubicarla). */
  fila: number;
  poliza: string;
  comisionPagada: number;
  /** Número de recibo, si el archivo lo trae. */
  recibo?: number;
  /** Folio del recibo en la aseguradora (p. ej. "27872103"), si el archivo lo trae. */
  folio?: string;
  /** Fecha del recibo o inicio de su periodo (YYYY-MM-DD), si el archivo la trae. */
  fecha?: string;
};

/**
 * - conciliado: el recibo existe y la comisión pagada coincide con la esperada.
 * - auto_creado: la póliza existe pero el recibo no; al aplicar se crea ya conciliado (el estado
 *   de cuenta es la fuente de la verdad de lo cobrado).
 * - ya_conciliado: el recibo ya estaba conciliado (p. ej. se volvió a subir el archivo).
 */
export const ESTATUS_MATCH = [
  "conciliado",
  "auto_creado",
  "diferencia",
  "no_encontrado",
  "revisar",
  "ya_conciliado",
] as const;
export type EstatusMatch = (typeof ESTATUS_MATCH)[number];

/** Recibo que la conciliación creará (estatus auto_creado). */
export type NuevoRecibo = {
  polizaId: string;
  numero: number;
  /** Monto con dos decimales; estimado a partir de la prima de la póliza. */
  monto: string;
  /** YYYY-MM-DD: la fecha del archivo o, si no la trae, la del calendario de la póliza. */
  fecha: string;
  folio: string | null;
};

export type ResultadoMatch = {
  fila: number;
  polizaArchivo: string;
  estatus: EstatusMatch;
  /** Explicación breve del estatus (p. ej. por qué hay que revisarlo). */
  detalle: string | null;
  poliza: { id: string; numeroImpreso: string; cliente: string } | null;
  recibo: { id: string; numero: number; total: number; monto: number } | null;
  /** Solo en auto_creado: el recibo que se creará al aplicar. */
  nuevoRecibo: NuevoRecibo | null;
  folio: string | null;
  comisionPagada: number;
  /** Prima neta del recibo sobre la que se calculó la comisión esperada. */
  base: { primaNeta: number; recibos: number } | null;
  comisionEsperada: number | null;
  /** comisionPagada − comisionEsperada. */
  diferencia: number | null;
  porcentaje: {
    valor: number;
    origen: "personalizado" | "esquema";
    anio: number | null;
    /** El año sale de la antigüedad del titular o de las vigencias registradas en el CRM. */
    anioPor?: "antiguedad" | "vigencias";
    antiguedad?: string | null;
  } | null;
};

export type ResumenMatch = Record<EstatusMatch, number> & {
  /** Comisión esperada de los renglones que tienen una contra qué comparar. */
  esperada: number;
  /** Lo pagado en esos mismos renglones (comparable con `esperada`). */
  pagada: number;
  /** Lo pagado en renglones de recibos que se auto-crean. */
  pagadaAutoCreada: number;
  /** Lo pagado en renglones sin comisión esperada (no encontrados, por revisar). */
  pagadaSinCruce: number;
};

export type AnalisisResultado =
  | { ok: true; resultados: ResultadoMatch[]; resumen: ResumenMatch }
  | { ok: false; error: string };

export const MAX_FILAS_ESTADO = 5000;

/** Diferencia máxima (MXN) para considerar que el monto pagado coincide con el esperado. */
export const TOLERANCIA_MXN = 1;

/** Tipos de seguimiento de una aclaración de comisión (ver NotaAclaracion). */
export const TIPOS_NOTA = ["nota", "reclamo", "pago_adicional", "aceptada"] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];
