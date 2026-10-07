// Archivos e imágenes del chat: tipos permitidos, su firma real y nombres seguros (compartido por
// el navegador y el servidor).

export const MAX_BYTES_ADJUNTO = 25 * 1024 * 1024;
/** Archivos que se pueden mandar de una vez (cada uno va en su propio mensaje). */
export const MAX_ADJUNTOS_POR_ENVIO = 10;
/** Primeros bytes que el servidor revisa para confirmar el tipo real del archivo. */
export const BYTES_FIRMA = 512;

type DefinicionAdjunto = {
  extension: string;
  /** Para mostrar ("PDF", "Excel"…). */
  etiqueta: string;
  /** Se muestra dentro del chat; el resto se descarga. */
  imagen?: boolean;
  /** Se abre en el navegador en lugar de descargarse (imágenes y PDF). */
  enLinea?: boolean;
  /** ¿Los primeros bytes corresponden al tipo? */
  firma: (b: Uint8Array) => boolean;
};

const empieza = (b: Uint8Array, ...bytes: number[]) => bytes.every((x, i) => b[i] === x);
const ZIP = (b: Uint8Array) => empieza(b, 0x50, 0x4b, 0x03, 0x04) || empieza(b, 0x50, 0x4b, 0x05, 0x06);
// Documentos de Office anteriores a 2007 (contenedor OLE).
const OLE = (b: Uint8Array) => empieza(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
// Texto: sin bytes nulos en el inicio.
const TEXTO = (b: Uint8Array) => b.length > 0 && !b.includes(0);

export const TIPOS_ADJUNTO: Record<string, DefinicionAdjunto> = {
  "image/jpeg": { extension: "jpg", etiqueta: "Imagen", imagen: true, enLinea: true, firma: (b) => empieza(b, 0xff, 0xd8, 0xff) },
  "image/png": { extension: "png", etiqueta: "Imagen", imagen: true, enLinea: true, firma: (b) => empieza(b, 0x89, 0x50, 0x4e, 0x47) },
  "image/gif": { extension: "gif", etiqueta: "Imagen", imagen: true, enLinea: true, firma: (b) => empieza(b, 0x47, 0x49, 0x46, 0x38) },
  "image/webp": {
    extension: "webp",
    etiqueta: "Imagen",
    imagen: true,
    enLinea: true,
    firma: (b) => empieza(b, 0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  // Fotos de iPhone: la mayoría de los navegadores no las muestran, así que se descargan.
  "image/heic": { extension: "heic", etiqueta: "Foto HEIC", firma: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  "application/pdf": { extension: "pdf", etiqueta: "PDF", enLinea: true, firma: (b) => empieza(b, 0x25, 0x50, 0x44, 0x46) },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: "docx", etiqueta: "Word", firma: ZIP },
  "application/msword": { extension: "doc", etiqueta: "Word", firma: OLE },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extension: "xlsx", etiqueta: "Excel", firma: ZIP },
  "application/vnd.ms-excel": { extension: "xls", etiqueta: "Excel", firma: OLE },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extension: "pptx", etiqueta: "PowerPoint", firma: ZIP },
  "application/zip": { extension: "zip", etiqueta: "ZIP", firma: ZIP },
  "text/csv": { extension: "csv", etiqueta: "CSV", firma: TEXTO },
  "text/plain": { extension: "txt", etiqueta: "Texto", firma: TEXTO },
};

/** Tipo según la extensión: cada sistema reporta tipos distintos (Windows dice que un CSV es Excel). */
const POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  csv: "text/csv",
  txt: "text/plain",
};

/** Para el selector de archivos del navegador. */
export const ACEPTA_ADJUNTOS = [...Object.keys(POR_EXTENSION).map((e) => `.${e}`), "image/*"].join(",");

/** Tipo permitido de un archivo (por su extensión; si no trae, por lo que diga el navegador), o null. */
export function tipoDeAdjunto(nombre: string, tipoNavegador: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(nombre)?.[1]?.toLowerCase();
  if (extension) return POR_EXTENSION[extension] ?? null;
  return tipoNavegador in TIPOS_ADJUNTO ? tipoNavegador : null;
}

export const esTipoAdjunto = (tipo: unknown): tipo is string => typeof tipo === "string" && tipo in TIPOS_ADJUNTO;
export const esImagen = (tipo: string | null | undefined) => Boolean(tipo && TIPOS_ADJUNTO[tipo]?.imagen);

/** Nombre para mostrar y para la descarga: sin rutas ni caracteres de control, con su extensión. */
export function nombreAdjunto(nombre: unknown): string {
  const limpio = (typeof nombre === "string" ? nombre : "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const punto = limpio.lastIndexOf(".");
  const extension = punto > 0 && limpio.length - punto <= 6 ? limpio.slice(punto) : "";
  const base = extension ? limpio.slice(0, punto) : limpio;
  return `${base.slice(0, 120 - extension.length).trim() || "archivo"}${extension}`;
}

/** "1.2 MB", "350 KB". */
export function formatoBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-MX", { maximumFractionDigits: 1 })} MB`;
}

/** Clave del objeto de un adjunto del chat: chat/{agenciaId}/{uuid}.{ext}. */
export const claveAdjunto = (agenciaId: string, tipo: string) =>
  `chat/${agenciaId}/${crypto.randomUUID()}.${TIPOS_ADJUNTO[tipo].extension}`;

/** ¿La clave es de un adjunto del chat de esa agencia y del tipo indicado? (no se confía en el navegador). */
export function claveAdjuntoValida(clave: unknown, agenciaId: string, tipo: string): clave is string {
  if (typeof clave !== "string" || !esTipoAdjunto(tipo)) return false;
  const extension = TIPOS_ADJUNTO[tipo].extension;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return new RegExp(`^chat/${agenciaId.replace(/[^0-9a-f-]/gi, "")}/${uuid}\\.${extension}$`, "i").test(clave);
}
