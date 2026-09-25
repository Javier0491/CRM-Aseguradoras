import "server-only";

import { ARCHIVOS_BUCKET } from "@/lib/archivos/config";
import {
  VIGENCIA_DESCARGA_S,
  type Almacen,
} from "@/lib/archivos/almacen/tipos";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase Storage (bucket privado "expedientes"). Opera con la sesión del usuario, así que
 * aplican las políticas del bucket (supabase/storage-expedientes.sql).
 */
export function crearAlmacenSupabase(): Almacen {
  const storage = async () => (await createSupabaseServerClient()).storage.from(ARCHIVOS_BUCKET);

  return {
    proveedor: "supabase",

    async urlSubida(clave, contentType) {
      const { data, error } = await (await storage()).createSignedUploadUrl(clave);
      if (error || !data) throw new Error(`No se pudo firmar la subida: ${error?.message}`);
      const config = getSupabaseConfig();
      return {
        url: data.signedUrl,
        headers: {
          "content-type": contentType,
          "x-upsert": "false",
          // Llave pública (la misma que ya usa el navegador); la autorización la da el token de la URL.
          ...(config && { apikey: config.key }),
        },
      };
    },

    async info(clave) {
      const { data, error } = await (await storage()).info(clave);
      return error || !data ? null : { bytes: data.size ?? 0 };
    },

    async leerInicio(clave, n) {
      const { data } = await (await storage()).createSignedUrl(clave, VIGENCIA_DESCARGA_S);
      if (!data) return null;
      const r = await fetch(data.signedUrl, { headers: { range: `bytes=0-${n - 1}` } });
      return r.ok ? new Uint8Array(await r.arrayBuffer()).slice(0, n) : null;
    },

    async eliminar(claves) {
      if (claves.length === 0) return;
      const { error } = await (await storage()).remove(claves);
      if (error) throw new Error(`No se pudo borrar en Storage: ${error.message}`);
    },

    async urlDescarga(clave, opciones) {
      const { data, error } = await (await storage()).createSignedUrl(
        clave,
        VIGENCIA_DESCARGA_S,
        opciones?.descargarComo ? { download: opciones.descargarComo } : undefined
      );
      if (error || !data) throw new Error(`No se pudo firmar la descarga: ${error?.message}`);
      return data.signedUrl;
    },
  };
}
