import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

import { getConciliador, getCurrentUser } from "@/lib/auth/dal";
import { leerEstadoDeCuentaPdf } from "@/lib/conciliacion/pdf";
import { PDF_MAX_BYTES, type LecturaPdfRespuesta } from "@/lib/conciliacion/pdf-formato";
import { db } from "@/lib/db";
import { OcrNoConfiguradoError, OcrRespuestaInvalidaError } from "@/lib/ocr/extractor";

// Leer un estado de cuenta largo con IA puede tardar cerca de dos minutos.
export const maxDuration = 120;

function error(mensaje: string, status: number) {
  return Response.json({ ok: false, error: mensaje } satisfies LecturaPdfRespuesta, { status });
}

/** Traduce los errores del proveedor de IA a mensajes claros. */
function errorDeLectura(e: unknown) {
  if (e instanceof OcrNoConfiguradoError) return error("La lectura con IA no está configurada (falta OPENAI_API_KEY).", 503);
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) {
    return error("La llave de OpenAI es inválida o no tiene permisos.", 503);
  }
  if (e instanceof RateLimitError) {
    return error("Se alcanzó el límite de uso de OpenAI. Intenta en unos minutos o revisa el saldo de la cuenta.", 429);
  }
  if (e instanceof APIConnectionTimeoutError) {
    return error("La lectura del PDF tardó demasiado. Divide el archivo o usa el Excel del portal de la aseguradora.", 504);
  }
  if (e instanceof APIConnectionError) return error("No se pudo contactar al servicio de IA.", 502);
  if (e instanceof BadRequestError) {
    return error("El servicio de IA no pudo procesar este PDF (¿tiene más de 100 páginas o está protegido?).", 422);
  }
  if (e instanceof OcrRespuestaInvalidaError) return error("La IA no devolvió una lectura válida del PDF. Intenta de nuevo.", 502);
  return error("No fue posible leer el PDF.", 502);
}

/**
 * POST /api/conciliacion/pdf — `multipart/form-data` con el estado de cuenta en `archivo` (PDF) y,
 * opcional, `aseguradoraId` para orientar la lectura. Devuelve la tabla leída para revisarla en
 * el mapeo de columnas; no concilia nada ni guarda el archivo.
 */
export async function POST(request: Request) {
  const usuario = await getConciliador();
  if (!usuario) {
    return (await getCurrentUser())
      ? error("Tu rol no permite conciliar la cobranza.", 403)
      : error("No autenticado.", 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("La solicitud debe enviarse como multipart/form-data.", 400);
  }
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return error("No se recibió el PDF.", 400);
  if (archivo.size > PDF_MAX_BYTES) return error("El PDF excede el límite de 10 MB.", 413);
  // La firma del archivo, no solo su extensión.
  const firma = new TextDecoder().decode(await archivo.slice(0, 5).arrayBuffer());
  if (firma !== "%PDF-") return error("El archivo no es un PDF válido.", 415);

  const aseguradoraId = formData.get("aseguradoraId");
  const aseguradora =
    typeof aseguradoraId === "string" && aseguradoraId
      ? await db.aseguradora.findUnique({ where: { id: aseguradoraId, agenciaId: usuario.agenciaId }, select: { nombre: true } })
      : null;

  try {
    const lectura = await leerEstadoDeCuentaPdf(archivo, aseguradora?.nombre);
    if (lectura.filas.length === 0) {
      return error("No se encontraron renglones de comisión en el PDF. Si es una imagen escaneada, prueba con una más nítida.", 422);
    }
    return Response.json({ ok: true, ...lectura } satisfies LecturaPdfRespuesta);
  } catch (e) {
    // Solo el tipo y el mensaje del error: nunca el contenido del documento.
    console.error("[conciliacion/pdf]", e instanceof Error ? `${e.name}: ${e.message}` : e);
    return errorDeLectura(e);
  }
}
