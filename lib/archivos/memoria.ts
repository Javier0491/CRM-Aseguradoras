// Copias en memoria de los archivos que el usuario elige o arrastra (solo navegador).
//
// Un File del navegador es solo una referencia al archivo en disco: se vuelve a leer cada vez
// que se usa. Si ese archivo desaparece antes (un PDF arrastrado desde dentro de un ZIP o de un
// adjunto de correo vive en una carpeta temporal que Windows borra; o se movió o renombró), la
// lectura falla con NotFoundError al guardar. Copiarlo al elegirlo evita depender del disco.

export const MENSAJE_ARCHIVO_PERDIDO =
  "ya no se puede leer: el archivo se movió, se renombró o era temporal (p. ej. abierto desde un ZIP o un correo). " +
  "Guárdalo en una carpeta y vuelve a seleccionarlo.";

/** Error del navegador al leer un archivo que ya no existe o no se puede abrir. */
export function esArchivoIlegible(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "NotFoundError" || e.name === "NotReadableError");
}

/** Copia el contenido del archivo a memoria; conserva nombre, tipo y fecha. */
export async function copiarEnMemoria(archivo: File): Promise<File> {
  const contenido = await archivo.arrayBuffer();
  return new File([contenido], archivo.name, { type: archivo.type, lastModified: archivo.lastModified });
}

/**
 * Copia varios archivos a memoria. Si alguno no se puede leer devuelve el mensaje para el
 * usuario en lugar de lanzar el error.
 */
export async function copiarTodosEnMemoria(
  archivos: readonly File[]
): Promise<{ ok: true; archivos: File[] } | { ok: false; error: string }> {
  const copias: File[] = [];
  for (const archivo of archivos) {
    try {
      copias.push(await copiarEnMemoria(archivo));
    } catch (e) {
      if (!esArchivoIlegible(e)) throw e;
      return { ok: false, error: `«${archivo.name}» ${MENSAJE_ARCHIVO_PERDIDO}` };
    }
  }
  return { ok: true, archivos: copias };
}
