import { getUsuarioCrm } from "@/lib/auth/dal";
import { leerDocumentosAuto } from "@/lib/cotizador/lector";
import { OcrNoConfiguradoError } from "@/lib/ocr/extractor";
import { OCR_TIPOS_PERMITIDOS } from "@/lib/ocr/types";
import { liberarEscaneoOcr, reservarEscaneoOcr } from "@/lib/planes/limites";

// La lectura con IA puede tardar varias decenas de segundos.
export const maxDuration = 90;

/** Vercel rechaza solicitudes de más de 4.5 MB antes de llegar aquí. */
const MAX_BYTES_TOTAL = 4 * 1024 * 1024;
const MAX_ARCHIVOS = 4;

const error = (mensaje: string, status: number) => Response.json({ ok: false, error: mensaje }, { status });

/**
 * POST /api/cotizador/leer — lee con IA la identificación del conductor y la tarjeta de
 * circulación (o factura) para prellenar la cotización. multipart/form-data con los archivos en
 * `files`. Cuenta como un escaneo del plan, igual que la Captura Inteligente.
 */
export async function POST(request: Request) {
  const user = await getUsuarioCrm();
  if (!user) return error("Tu sesión venció. Vuelve a iniciar sesión.", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Los documentos no llegaron completos. Intenta de nuevo.", 400);
  }
  const archivos = formData.getAll("files").filter((a): a is File => a instanceof File && a.size > 0);
  if (archivos.length === 0) return error("Sube la identificación y la tarjeta de circulación.", 400);
  if (archivos.length > MAX_ARCHIVOS) return error(`Sube como máximo ${MAX_ARCHIVOS} documentos.`, 413);
  if (archivos.some((a) => !(OCR_TIPOS_PERMITIDOS as readonly string[]).includes(a.type))) {
    return error("Formato no soportado. Usa fotos (JPG, PNG, WEBP) o PDF.", 415);
  }
  if (archivos.reduce((t, a) => t + a.size, 0) > MAX_BYTES_TOTAL) {
    return error("Los documentos pesan demasiado (máximo 4 MB entre todos). Prueba con fotos más ligeras.", 413);
  }

  const reserva = await reservarEscaneoOcr(user.agenciaId);
  if (!reserva.ok) return error(reserva.error, 429);
  try {
    const lectura = await leerDocumentosAuto(archivos);
    return Response.json({ ok: true, lectura });
  } catch (e) {
    console.error("[cotizador/leer]", e instanceof Error ? `${e.name}: ${e.message}` : e);
    await liberarEscaneoOcr(user.agenciaId, reserva.periodo).catch(() => {});
    if (e instanceof OcrNoConfiguradoError) return error("La lectura con IA no está configurada.", 503);
    return error("No se pudieron leer los documentos. Intenta de nuevo o llena los datos a mano.", 502);
  }
}
