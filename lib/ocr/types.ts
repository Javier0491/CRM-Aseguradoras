import type { Ramo } from "@/lib/polizas/ramos";

export const OCR_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const OCR_TIPOS_PERMITIDOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type CampoExtraido<T> = {
  valor: T;
  /** Confianza del modelo entre 0 y 1. */
  confianza: number;
};

export type ExtraccionPoliza = {
  aseguradora: CampoExtraido<string>;
  cliente: CampoExtraido<string>;
  ramo: CampoExtraido<Ramo>;
  /** Prima total en MXN. */
  monto: CampoExtraido<number>;
  vigencia: CampoExtraido<{ inicio: string; fin: string }>; // ISO yyyy-mm-dd
  numeroPoliza: CampoExtraido<string>;
};

export type OcrRespuesta =
  | {
      ok: true;
      archivo: { nombre: string; tipo: string; bytes: number };
      proveedor: string;
      procesadoEn: string;
      datos: ExtraccionPoliza;
    }
  | { ok: false; error: string };
