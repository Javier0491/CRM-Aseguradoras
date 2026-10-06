// Subida de archivos de póliza desde el navegador, independiente del proveedor:
//   1. el servidor valida y firma una URL de subida (prepararSubida),
//   2. el navegador sube el archivo directo al almacenamiento (Supabase o R2) con PUT,
//   3. el servidor verifica el objeto y lo vincula a la póliza (vincularArchivo).
import {
  prepararSubida,
  vincularArchivo,
  type VincularArchivoResultado,
} from "@/lib/archivos/actions";
import { ARCHIVOS, type TipoArchivo } from "@/lib/archivos/config";

export async function subirArchivo(
  polizaId: string,
  tipo: TipoArchivo,
  archivo: File
): Promise<VincularArchivoResultado> {
  const preparada = await prepararSubida(polizaId, tipo, archivo.size);
  if (!preparada.ok) return preparada;

  // El tipo va con su valor canónico: Windows etiqueta los ZIP como "x-zip-compressed" y la
  // firma de la URL exige exactamente el tipo con el que se firmó (el contenido ya se validó).
  const cuerpo = new Blob([archivo], { type: ARCHIVOS[tipo].mime });
  try {
    const r = await fetch(preparada.url, { method: "PUT", headers: preparada.headers, body: cuerpo });
    if (!r.ok) {
      console.error("[subirArchivo]", r.status, await r.text().catch(() => ""));
      return { ok: false, error: "No se pudo subir el archivo al almacenamiento." };
    }
  } catch (e) {
    console.error("[subirArchivo]", e);
    // El navegador no deja ver la causa, pero si hay conexión casi siempre es que el bucket no
    // acepta subidas desde este dominio (su política CORS).
    return {
      ok: false,
      error: navigator.onLine
        ? `El almacenamiento rechazó la subida desde ${window.location.host}. Pide al administrador de la plataforma que agregue este dominio a la política CORS del bucket (Plataforma → Diagnóstico lo verifica).`
        : "Sin conexión a internet: no se pudo subir el archivo.",
    };
  }

  return vincularArchivo(polizaId, tipo, preparada.clave, archivo.name);
}
