import { getCurrentUser } from "@/lib/auth/dal";
import { getExtractor } from "@/lib/ocr/extractor";
import {
  OCR_MAX_BYTES,
  OCR_TIPOS_PERMITIDOS,
  type OcrRespuesta,
} from "@/lib/ocr/types";

function error(mensaje: string, status: number) {
  return Response.json({ ok: false, error: mensaje } satisfies OcrRespuesta, {
    status,
  });
}

/**
 * POST /api/ocr
 * Recibe un `multipart/form-data` con el campo `file` (PDF o imagen) y
 * devuelve los datos clave de la póliza extraídos por el motor configurado.
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

  const extractor = getExtractor();
  try {
    const datos = await extractor.extraer(archivo);
    return Response.json({
      ok: true,
      archivo: { nombre: archivo.name, tipo: archivo.type, bytes: archivo.size },
      proveedor: extractor.nombre,
      procesadoEn: new Date().toISOString(),
      datos,
    } satisfies OcrRespuesta);
  } catch (e) {
    console.error("[ocr] Error en la extracción", e);
    return error("No fue posible procesar el documento.", 502);
  }
}
