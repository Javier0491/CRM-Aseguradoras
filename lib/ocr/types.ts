import type { AseguradoValores } from "@/lib/polizas/asegurados";
import type { Ramo } from "@/lib/polizas/ramos";
import type { Valores } from "@/lib/polizas/validacion";

/**
 * Contexto opcional de la lectura. "gmm_colectivo": el documento es un formato de
 * negociación u orden de emisión de GMM Colectivo que complementa la carátula.
 */
export const CONTEXTOS_OCR = ["gmm_colectivo"] as const;
export type ContextoOcr = (typeof CONTEXTOS_OCR)[number];

export const OCR_MAX_BYTES = 10 * 1024 * 1024; // 10 MB por archivo
/** Documentos que se pueden leer juntos (p. ej. carátula + recibo). */
export const OCR_MAX_ARCHIVOS = 5;
export const OCR_MAX_BYTES_TOTAL = 25 * 1024 * 1024; // 25 MB entre todos

export const OCR_TIPOS_PERMITIDOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/**
 * Datos extraídos de una carátula, ya en el formato que espera el formulario
 * de captura (mismos nombres de campo que `camposGenerales` y `seccionesPorRamo`).
 */
export type ExtraccionPoliza = {
  ramo: Ramo | null;
  /** Campos generales detectados. `aseguradora` contiene el NOMBRE, no el id. */
  generales: Valores;
  /** Campos específicos del ramo detectado. */
  especificos: Valores;
  /**
   * Referencia de pago tal como aparece impresa. Si la carátula no trae el número de
   * póliza, de aquí se calcula la póliza vigor.
   */
  referenciaPago: string | null;
  /**
   * La suma asegurada viene como "Sin límite" (u otra variación). Solo es true en ramos con
   * suma asegurada; entonces su cantidad y unidad no vienen en `especificos`.
   */
  sumaAseguradaIlimitada: boolean;
  /** Personas aseguradas detectadas, en el orden de la carátula. */
  asegurados: AseguradoValores[];
  /** Observaciones para que el usuario revise (datos ambiguos, ilegibles, etc.). */
  advertencias: string[];
};

export type OcrRespuesta =
  | {
      ok: true;
      archivos: { nombre: string; tipo: string; bytes: number }[];
      proveedor: string;
      modelo: string;
      procesadoEn: string;
      datos: ExtraccionPoliza;
    }
  | { ok: false; error: string };
