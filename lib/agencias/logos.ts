import "server-only";

import { LOGO_FORMATOS, LOGO_MAX_BYTES, LOGOS_BUCKET, type FormatoLogo } from "@/lib/agencias/marca";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export class LogoError extends Error {}

/** Verifica tamaño, tipo declarado y firma real del archivo (no se confía en el navegador). */
async function validarLogo(archivo: File): Promise<(typeof LOGO_FORMATOS)[FormatoLogo]> {
  if (archivo.size <= 0 || archivo.size > LOGO_MAX_BYTES) {
    throw new LogoError(`El logo debe pesar como máximo ${LOGO_MAX_BYTES / 1024} KB.`);
  }
  const formato = LOGO_FORMATOS[archivo.type as FormatoLogo];
  if (!formato) throw new LogoError("Usa una imagen PNG, JPG o WEBP.");
  const inicio = new Uint8Array(await archivo.slice(0, 12).arrayBuffer());
  const firmaOk =
    formato.firma.every((b, i) => inicio[i] === b) &&
    (archivo.type !== "image/webp" || String.fromCharCode(...inicio.slice(8, 12)) === "WEBP");
  if (!firmaOk) throw new LogoError("El archivo no es una imagen válida.");
  return formato;
}

/**
 * Sube el logo al bucket público "marcas" con la secret key (el bucket no admite escrituras por
 * la API: solo la app, tras verificar que es un ADMIN de la agencia). Clave nueva en cada subida
 * para que el navegador no muestre el logo anterior en caché. Devuelve la URL pública.
 */
export async function subirLogo(agenciaId: string, archivo: File): Promise<string> {
  const formato = await validarLogo(archivo);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new LogoError("Falta SUPABASE_SECRET_KEY en el servidor para poder subir el logo.");
  const clave = `${agenciaId}/logo-${crypto.randomUUID()}.${formato.extension}`;
  const bucket = supabase.storage.from(LOGOS_BUCKET);
  const { error } = await bucket.upload(clave, archivo, { contentType: archivo.type, upsert: false });
  if (error) {
    console.error("[subirLogo]", error.message);
    throw new LogoError("No se pudo guardar el logo. Intenta de nuevo.");
  }
  return bucket.getPublicUrl(clave).data.publicUrl;
}

/** Borra un logo anterior si es de este bucket y de esta agencia; los de /public no se tocan. */
export async function eliminarLogo(agenciaId: string, url: string | null) {
  const marca = `/storage/v1/object/public/${LOGOS_BUCKET}/`;
  const i = url?.indexOf(marca) ?? -1;
  if (!url || i < 0) return;
  const clave = decodeURIComponent(url.slice(i + marca.length));
  if (!clave.startsWith(`${agenciaId}/`)) return;
  const { error } = (await getSupabaseAdmin()?.storage.from(LOGOS_BUCKET).remove([clave])) ?? {};
  // Si falla solo queda un archivo huérfano: la agencia ya apunta al logo nuevo.
  if (error) console.error("[eliminarLogo]", error.message);
}
