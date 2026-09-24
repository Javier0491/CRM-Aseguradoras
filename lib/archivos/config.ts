// Archivos de una póliza en Supabase Storage (carátula PDF y expediente ZIP).
// Reglas compartidas por cliente y servidor.

/** Bucket privado; ver supabase/storage-expedientes.sql. */
export const ARCHIVOS_BUCKET = "expedientes";

export const TIPOS_ARCHIVO = ["caratula", "expediente"] as const;
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

type DefinicionArchivo = {
  etiqueta: string;
  extension: string;
  mime: string;
  /** Tipos que el selector de archivos ofrece (Windows reporta el ZIP como x-zip-compressed). */
  accept: string;
  maxBytes: number;
  /** Primeros bytes válidos del archivo. */
  firmas: number[][];
};

export const ARCHIVOS: Record<TipoArchivo, DefinicionArchivo> = {
  caratula: {
    etiqueta: "Carátula (PDF)",
    extension: "pdf",
    mime: "application/pdf",
    accept: ".pdf,application/pdf",
    maxBytes: 20 * 1024 * 1024,
    firmas: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  },
  expediente: {
    etiqueta: "Expediente Completo (ZIP)",
    extension: "zip",
    mime: "application/zip",
    accept: ".zip,application/zip,application/x-zip-compressed",
    // Debe coincidir con `file_size_limit` del bucket.
    maxBytes: 50 * 1024 * 1024,
    firmas: [
      [0x50, 0x4b, 0x03, 0x04], // PK con archivos
      [0x50, 0x4b, 0x05, 0x06], // PK vacío
    ],
  },
};

export const esTipoArchivo = (v: unknown): v is TipoArchivo =>
  typeof v === "string" && (TIPOS_ARCHIVO as readonly string[]).includes(v);

/** `{polizaId}/{uuid}.{ext}`: cada subida usa una ruta nueva, así nunca se sobrescribe. */
export const rutaArchivoValida = (polizaId: string, tipo: TipoArchivo, path: string) =>
  /^[a-z0-9]+$/i.test(polizaId) &&
  new RegExp(`^${polizaId}/[0-9a-f-]{36}\\.${ARCHIVOS[tipo].extension}$`).test(path);

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Valida extensión, tamaño y firma del archivo. No se confía en `file.type`,
 * que varía entre sistemas operativos y navegadores.
 */
export async function validarArchivo(tipo: TipoArchivo, archivo: File): Promise<string | null> {
  const def = ARCHIVOS[tipo];
  if (!archivo.name.toLowerCase().endsWith(`.${def.extension}`)) {
    return `Debe ser un archivo .${def.extension}.`;
  }
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > def.maxBytes) return `Excede el límite de ${formatBytes(def.maxBytes)}.`;

  const inicio = new Uint8Array(await archivo.slice(0, 4).arrayBuffer());
  const valido = def.firmas.some((firma) => firma.every((b, i) => inicio[i] === b));
  return valido ? null : `El archivo no es un ${def.extension.toUpperCase()} válido.`;
}
