"use server";

import { getAlmacen } from "@/lib/archivos/almacen";
import type { SubidaFirmada } from "@/lib/archivos/almacen/tipos";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { claveOcr, esTipoOcr } from "@/lib/ocr/subida";
import { OCR_MAX_ARCHIVOS, OCR_MAX_BYTES, OCR_MAX_BYTES_TOTAL } from "@/lib/ocr/types";

export type PrepararSubidaOcrResultado =
  | { ok: true; subidas: (SubidaFirmada & { clave: string })[] }
  | { ok: false; error: string };

/**
 * Firma la subida directa al almacenamiento de los documentos que se van a leer con IA y que,
 * juntos, no caben en una solicitud a /api/ocr. Los mismos límites que la lectura directa.
 */
export async function prepararSubidaOcr(archivos: { tipo: string; bytes: number }[]): Promise<PrepararSubidaOcrResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión venció. Vuelve a iniciar sesión." };
  if (!Array.isArray(archivos) || archivos.length === 0) return { ok: false, error: "No hay documentos que subir." };
  if (archivos.length > OCR_MAX_ARCHIVOS) return { ok: false, error: `Sube como máximo ${OCR_MAX_ARCHIVOS} documentos a la vez.` };

  let total = 0;
  for (const a of archivos) {
    if (typeof a !== "object" || a === null || !esTipoOcr(a.tipo)) {
      return { ok: false, error: "Formato no soportado. Usa PDF, PNG, JPG o WEBP." };
    }
    if (typeof a.bytes !== "number" || !Number.isInteger(a.bytes) || a.bytes <= 0 || a.bytes > OCR_MAX_BYTES) {
      return { ok: false, error: "Cada documento debe pesar como máximo 10 MB." };
    }
    total += a.bytes;
  }
  if (total > OCR_MAX_BYTES_TOTAL) return { ok: false, error: "Los documentos exceden en conjunto el límite de 25 MB." };

  try {
    const almacen = getAlmacen();
    const subidas = await Promise.all(
      archivos.map(async (a) => {
        const clave = claveOcr(user.agenciaId, a.tipo as Parameters<typeof claveOcr>[1]);
        return { clave, ...(await almacen.urlSubida(clave, a.tipo, a.bytes)) };
      })
    );
    return { ok: true, subidas };
  } catch (e) {
    console.error("[ocr] prepararSubidaOcr", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo preparar la subida de los documentos." };
  }
}
