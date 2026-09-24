import type { Ramo } from "@/lib/polizas/ramos";
import type { Valores } from "@/lib/polizas/validacion";

export const OCR_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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
  /** Observaciones para que el usuario revise (datos ambiguos, ilegibles, etc.). */
  advertencias: string[];
};

export type OcrRespuesta =
  | {
      ok: true;
      archivo: { nombre: string; tipo: string; bytes: number };
      proveedor: string;
      modelo: string;
      procesadoEn: string;
      datos: ExtraccionPoliza;
    }
  | { ok: false; error: string };
