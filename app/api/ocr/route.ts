import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import {
  getExtractor,
  OcrNoConfiguradoError,
  OcrRespuestaInvalidaError,
} from "@/lib/ocr/extractor";
import {
  CONTEXTOS_OCR,
  OCR_MAX_BYTES,
  OCR_TIPOS_PERMITIDOS,
  type ContextoOcr,
  type OcrRespuesta,
} from "@/lib/ocr/types";

// La lectura de una carátula con IA puede tardar varias decenas de segundos.
export const maxDuration = 120;

function error(mensaje: string, status: number) {
  return Response.json({ ok: false, error: mensaje } satisfies OcrRespuesta, {
    status,
  });
}

/** Traduce errores del proveedor de IA a respuestas claras para el usuario. */
function errorDeExtraccion(e: unknown) {
  if (e instanceof OcrNoConfiguradoError) {
    return error("La captura inteligente no está configurada (falta OPENAI_API_KEY).", 503);
  }
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) {
    return error("La llave de OpenAI es inválida o no tiene permisos.", 503);
  }
  if (e instanceof RateLimitError) {
    return error("Se alcanzó el límite de uso de OpenAI. Intenta en unos minutos o revisa el saldo de la cuenta.", 429);
  }
  if (e instanceof APIConnectionTimeoutError) {
    return error("La lectura del documento tardó demasiado. Intenta de nuevo.", 504);
  }
  if (e instanceof APIConnectionError) {
    return error("No se pudo contactar al servicio de IA.", 502);
  }
  if (e instanceof BadRequestError) {
    return error("El servicio de IA no pudo procesar este archivo. Prueba con otro formato o una imagen más nítida.", 422);
  }
  if (e instanceof OcrRespuestaInvalidaError) {
    return error("La IA no devolvió una lectura válida del documento. Intenta de nuevo.", 502);
  }
  return error("No fue posible procesar el documento.", 502);
}

/**
 * POST /api/ocr
 * Recibe un `multipart/form-data` con el campo `file` (PDF o imagen) y, opcionalmente,
 * `contexto` (ver CONTEXTOS_OCR). Devuelve los datos extraídos con IA.
 */
export async function POST(request: Request) {
  if (!(await getCurrentUser())) return error("No autenticado.", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("La solicitud debe enviarse como multipart/form-data.", 400);
  }

  const archivo = formData.get("file");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return error("No se recibió ningún archivo en el campo 'file'.", 400);
  }

  if (!(OCR_TIPOS_PERMITIDOS as readonly string[]).includes(archivo.type)) {
    return error("Formato no soportado. Usa PDF, PNG, JPG o WEBP.", 415);
  }

  if (archivo.size > OCR_MAX_BYTES) {
    return error("El archivo excede el límite de 10 MB.", 413);
  }

  // Contexto opcional: p. ej. "gmm_colectivo" para un formato de negociación.
  const contextoRaw = formData.get("contexto");
  const contexto = contextoRaw === null || contextoRaw === "" ? undefined : contextoRaw;
  if (contexto !== undefined && !(CONTEXTOS_OCR as readonly unknown[]).includes(contexto)) {
    return error("Contexto de lectura no válido.", 400);
  }

  try {
    const extractor = getExtractor();
    // La IA solo puede elegir entre las aseguradoras registradas.
    const aseguradoras = (
      await db.aseguradora.findMany({ select: { nombre: true }, orderBy: { nombre: "asc" } })
    ).map((a) => a.nombre);

    const datos = await extractor.extraer(archivo, aseguradoras, contexto as ContextoOcr | undefined);
    return Response.json({
      ok: true,
      archivo: { nombre: archivo.name, tipo: archivo.type, bytes: archivo.size },
      proveedor: extractor.proveedor,
      modelo: extractor.modelo,
      procesadoEn: new Date().toISOString(),
      datos,
    } satisfies OcrRespuesta);
  } catch (e) {
    // Solo el tipo y mensaje del error: nunca el contenido del documento.
    console.error("[ocr] Error en la extracción:", e instanceof Error ? `${e.name}: ${e.message}` : e);
    return errorDeExtraccion(e);
  }
}
