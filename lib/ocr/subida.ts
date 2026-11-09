// Documentos para la lectura con IA que pasan del límite de Vercel (4.5 MB por solicitud): el
// navegador los sube directo al almacenamiento y /api/ocr los lee de ahí con su clave.
import { OCR_TIPOS_PERMITIDOS } from "@/lib/ocr/types";

/** Hasta este total se mandan en la misma solicitud; arriba, por el almacenamiento. */
export const OCR_MAX_BYTES_DIRECTO = 4 * 1024 * 1024;

const EXTENSIONES: Record<(typeof OCR_TIPOS_PERMITIDOS)[number], string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const esTipoOcr = (tipo: unknown): tipo is (typeof OCR_TIPOS_PERMITIDOS)[number] =>
  typeof tipo === "string" && (OCR_TIPOS_PERMITIDOS as readonly string[]).includes(tipo);

/** Documento ya subido que el navegador manda a leer en el campo "remotos". */
export type DocumentoRemoto = { clave: string; nombre: string; tipo: string };

const limpiarAgencia = (agenciaId: string) => agenciaId.replace(/[^0-9a-z-]/gi, "");

export const claveOcr = (agenciaId: string, tipo: (typeof OCR_TIPOS_PERMITIDOS)[number]) =>
  `ocr-temporal/${limpiarAgencia(agenciaId)}/${crypto.randomUUID()}.${EXTENSIONES[tipo]}`;

/** ¿La clave es de un documento temporal de esa agencia y del tipo indicado? (no se confía en el navegador). */
export function claveOcrValida(clave: unknown, agenciaId: string, tipo: unknown): clave is string {
  if (typeof clave !== "string" || !esTipoOcr(tipo)) return false;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return new RegExp(`^ocr-temporal/${limpiarAgencia(agenciaId)}/${uuid}\\.${EXTENSIONES[tipo]}$`, "i").test(clave);
}
