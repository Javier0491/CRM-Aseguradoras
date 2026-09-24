// Subida de archivos de póliza desde el navegador. El archivo va directo a Supabase
// Storage con la sesión del usuario (sin pasar por el servidor de Next ni su límite de
// cuerpo), y después una Server Action lo vincula a la póliza.
import { vincularArchivo, type VincularArchivoResultado } from "@/lib/archivos/actions";
import { ARCHIVOS, ARCHIVOS_BUCKET, type TipoArchivo } from "@/lib/archivos/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function subirArchivo(
  polizaId: string,
  tipo: TipoArchivo,
  archivo: File
): Promise<VincularArchivoResultado> {
  const def = ARCHIVOS[tipo];
  const path = `${polizaId}/${crypto.randomUUID()}.${def.extension}`;
  const storage = createSupabaseBrowserClient().storage.from(ARCHIVOS_BUCKET);

  const { error } = await storage.upload(path, archivo, { contentType: def.mime, upsert: false });
  if (error) {
    console.error("[subirArchivo]", error);
    return { ok: false, error: "No se pudo subir el archivo a Storage." };
  }

  const resultado = await vincularArchivo(polizaId, tipo, path, archivo.name);
  if (!resultado.ok) {
    // Sin vínculo el archivo quedaría huérfano; se intenta retirarlo.
    await storage.remove([path]);
  }
  return resultado;
}
