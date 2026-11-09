// Envío de documentos a /api/ocr desde el navegador. Vercel rechaza solicitudes de más de
// 4.5 MB antes de que lleguen a la app (413 en texto plano), así que, si los documentos pasan de
// OCR_MAX_BYTES_DIRECTO, primero se suben directo al almacenamiento y se mandan solo sus claves.
import { prepararSubidaOcr } from "@/lib/ocr/actions";
import { OCR_MAX_BYTES_DIRECTO, type DocumentoRemoto } from "@/lib/ocr/subida";
import type { ContextoOcr, OcrRespuesta } from "@/lib/ocr/types";

export type ResultadoEnvioOcr = { status: number; json: OcrRespuesta };

const fallo = (status: number, error: string): ResultadoEnvioOcr => ({ status, json: { ok: false, error } });

/** Mensaje para una respuesta que no es el JSON de la app (la dio Vercel: límite o tiempo agotado). */
function mensajeSinJson(status: number) {
  if (status === 413) return "Los documentos pesan demasiado para enviarlos. Prueba con un archivo más ligero.";
  if (status === 504 || status === 502) return "La lectura del documento tardó demasiado. Intenta de nuevo.";
  if (status === 401 || status === 403) return "Tu sesión venció. Vuelve a iniciar sesión.";
  return `El servidor no pudo procesar la lectura (error ${status}). Intenta de nuevo.`;
}

/** La subida directa al almacenamiento falló (red, CORS del bucket o URL vencida). */
class ErrorSubidaOcr extends Error {}

/** Sube los documentos al almacenamiento y devuelve sus claves, o el error para el usuario. */
async function subirAlAlmacen(archivos: File[], signal?: AbortSignal): Promise<DocumentoRemoto[] | ResultadoEnvioOcr> {
  const preparada = await prepararSubidaOcr(archivos.map((a) => ({ tipo: a.type, bytes: a.size })));
  if (!preparada.ok) return fallo(400, preparada.error);
  await Promise.all(
    archivos.map(async (a, i) => {
      const { url, headers } = preparada.subidas[i];
      const r = await fetch(url, { method: "PUT", headers, body: new Blob([a], { type: a.type }), signal });
      if (!r.ok) throw new Error(`Subida rechazada (${r.status})`);
    })
  ).catch((e) => {
    if (signal?.aborted) throw e;
    console.error("[ocr] subida al almacenamiento", e);
    throw new ErrorSubidaOcr();
  });
  return archivos.map((a, i) => ({ clave: preparada.subidas[i].clave, nombre: a.name, tipo: a.type }));
}

/**
 * Manda a leer con IA los documentos de una póliza. Nunca lanza por respuestas del servidor
 * (siempre devuelve un OcrRespuesta); solo por un fetch abortado o sin conexión.
 */
export async function enviarOcr(
  archivos: File[],
  { contexto, masiva, signal }: { contexto?: ContextoOcr; masiva?: boolean; signal?: AbortSignal } = {}
): Promise<ResultadoEnvioOcr> {
  const body = new FormData();
  const total = archivos.reduce((t, a) => t + a.size, 0);
  if (total <= OCR_MAX_BYTES_DIRECTO) {
    for (const a of archivos) body.append("files", a);
  } else {
    try {
      const remotos = await subirAlAlmacen(archivos, signal);
      if (!Array.isArray(remotos)) return remotos;
      body.append("remotos", JSON.stringify(remotos));
    } catch (e) {
      if (!(e instanceof ErrorSubidaOcr)) throw e;
      return fallo(
        502,
        navigator.onLine
          ? "No se pudo subir el documento para leerlo. Intenta de nuevo; si sigue fallando, pide al administrador que revise el almacenamiento (Plataforma → Diagnóstico)."
          : "Sin conexión a internet: no se pudo subir el documento."
      );
    }
  }
  if (masiva) body.append("masiva", "1");
  if (contexto) body.append("contexto", contexto);

  const res = await fetch("/api/ocr", { method: "POST", body, signal });
  const texto = await res.text();
  try {
    return { status: res.status, json: JSON.parse(texto) as OcrRespuesta };
  } catch {
    return fallo(res.status, mensajeSinJson(res.status));
  }
}
