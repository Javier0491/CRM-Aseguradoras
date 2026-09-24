// Tipos de la conciliación de estados de cuenta de comisiones, compartidos por cliente y servidor.

/** Un renglón del estado de cuenta, ya leído del archivo con el mapeo de columnas. */
export type FilaEstado = {
  /** Número de fila en el archivo (para ubicarla). */
  fila: number;
  poliza: string;
  comisionPagada: number;
  /** Número de recibo, si el archivo lo trae. */
  recibo?: number;
};

export const ESTATUS_MATCH = ["conciliado", "diferencia", "no_encontrado", "revisar"] as const;
export type EstatusMatch = (typeof ESTATUS_MATCH)[number];

export type ResultadoMatch = {
  fila: number;
  polizaArchivo: string;
  estatus: EstatusMatch;
  /** Explicación breve del estatus (p. ej. por qué hay que revisarlo). */
  detalle: string | null;
  poliza: { id: string; numeroImpreso: string; cliente: string } | null;
  recibo: { id: string; numero: number; total: number; monto: number } | null;
  comisionPagada: number;
  comisionEsperada: number | null;
  /** comisionPagada − comisionEsperada. */
  diferencia: number | null;
  porcentaje: { valor: number; origen: "personalizado" | "esquema"; anio: number | null } | null;
};

export type ResumenMatch = Record<EstatusMatch, number> & {
  /** Comisión esperada de los renglones que tienen una contra qué comparar. */
  esperada: number;
  /** Lo pagado en esos mismos renglones (comparable con `esperada`). */
  pagada: number;
  /** Lo pagado en renglones sin comisión esperada (no encontrados, por revisar). */
  pagadaSinCruce: number;
};

export type AnalisisResultado =
  | { ok: true; resultados: ResultadoMatch[]; resumen: ResumenMatch }
  | { ok: false; error: string };

export const MAX_FILAS_ESTADO = 5000;

/** Diferencia máxima (MXN) para considerar que el monto pagado coincide con el esperado. */
export const TOLERANCIA_MXN = 1;
