// Lector mínimo de ZIP para el navegador (y Node en las pruebas), sin dependencias: lista los
// archivos del índice central y descomprime solo el que se pide con DecompressionStream.
//
// Sirve para los ZIP que entregan los portales de las aseguradoras (p. ej. las facturas: un ZIP
// con decenas de PDF y XML). Abrir el PDF desde el Explorador de Windows lo deja en una carpeta
// temporal que se borra y el navegador ya no lo puede leer; leerlo aquí evita ese paso.

export type EntradaZip = {
  /** Ruta dentro del ZIP, p. ej. "Factura/FACT_..._C.pdf". */
  ruta: string;
  /** Nombre sin carpetas. */
  nombre: string;
  /** Carpeta dentro del ZIP ("" si está en la raíz). */
  carpeta: string;
  tamano: number;
  metodo: number;
  cifrado: boolean;
  tamanoComprimido: number;
  /** Posición real del encabezado local (ya corregida por bytes antepuestos). */
  inicio: number;
};

export class ErrorZip extends Error {}

const FIRMA_FIN = 0x06054b50; // PK 05 06
const FIRMA_CENTRAL = 0x02014b50; // PK 01 02
const FIRMA_LOCAL = 0x04034b50; // PK 03 04
const SIN_LIMITE_32 = 0xffffffff;

/** Lee el índice del ZIP. Lanza ErrorZip si el archivo no es un ZIP que se pueda leer. */
export function leerIndiceZip(datos: Uint8Array): EntradaZip[] {
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  // El registro final mide 22 bytes más un comentario de hasta 64 KB: se busca de atrás hacia adelante.
  let fin = -1;
  for (let i = datos.length - 22; i >= Math.max(0, datos.length - 22 - 0xffff); i--) {
    if (vista.getUint32(i, true) === FIRMA_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErrorZip("El archivo no es un ZIP válido o está incompleto.");

  const total = vista.getUint16(fin + 10, true);
  const tamanoIndice = vista.getUint32(fin + 12, true);
  const posicionIndice = vista.getUint32(fin + 16, true);
  if (total === 0xffff || tamanoIndice === SIN_LIMITE_32 || posicionIndice === SIN_LIMITE_32) {
    throw new ErrorZip("El ZIP es demasiado grande para abrirlo aquí. Extráelo en una carpeta.");
  }
  // El índice va justo antes del registro final. Si alguien antepuso bytes al ZIP (p. ej. la marca
  // PK 07 08 de un solo volumen), las posiciones guardadas quedan corridas por esa cantidad.
  const inicioIndice = fin - tamanoIndice;
  const desfase = inicioIndice - posicionIndice;
  if (inicioIndice < 0 || desfase < 0) throw new ErrorZip("El índice del ZIP está dañado.");

  const utf8 = new TextDecoder("utf-8");
  const entradas: EntradaZip[] = [];
  let p = inicioIndice;
  for (let n = 0; n < total; n++) {
    if (p + 46 > fin || vista.getUint32(p, true) !== FIRMA_CENTRAL) {
      throw new ErrorZip("El índice del ZIP está dañado.");
    }
    const banderas = vista.getUint16(p + 8, true);
    const metodo = vista.getUint16(p + 10, true);
    const tamanoComprimido = vista.getUint32(p + 20, true);
    const tamano = vista.getUint32(p + 24, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const local = vista.getUint32(p + 42, true);
    const ruta = utf8.decode(datos.subarray(p + 46, p + 46 + largoNombre)).replace(/\\/g, "/");
    p += 46 + largoNombre + largoExtra + largoComentario;

    if (ruta.endsWith("/")) continue; // carpeta
    const corte = ruta.lastIndexOf("/");
    entradas.push({
      ruta,
      nombre: ruta.slice(corte + 1),
      carpeta: corte < 0 ? "" : ruta.slice(0, corte),
      tamano,
      metodo,
      cifrado: (banderas & 1) === 1,
      tamanoComprimido,
      inicio: local + desfase,
    });
  }
  return entradas;
}

/** Descomprime una entrada del ZIP. */
export async function extraerDeZip(datos: Uint8Array, entrada: EntradaZip): Promise<Uint8Array<ArrayBuffer>> {
  if (entrada.cifrado) throw new ErrorZip(`«${entrada.nombre}» está protegido con contraseña.`);
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const p = entrada.inicio;
  if (p + 30 > datos.length || vista.getUint32(p, true) !== FIRMA_LOCAL) {
    throw new ErrorZip(`No se encontró «${entrada.nombre}» dentro del ZIP.`);
  }
  const desde = p + 30 + vista.getUint16(p + 26, true) + vista.getUint16(p + 28, true);
  const comprimido = datos.slice(desde, desde + entrada.tamanoComprimido);
  if (comprimido.length !== entrada.tamanoComprimido) throw new ErrorZip("El ZIP está incompleto.");

  if (entrada.metodo === 0) return comprimido;
  if (entrada.metodo !== 8) {
    throw new ErrorZip(`«${entrada.nombre}» usa una compresión que no se puede abrir aquí. Extrae el ZIP en una carpeta.`);
  }
  try {
    const flujo = new Blob([comprimido]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  } catch {
    throw new ErrorZip(`«${entrada.nombre}» está dañado dentro del ZIP.`);
  }
}

export const esZip = (archivo: File) =>
  /\.zip$/i.test(archivo.name) || archivo.type === "application/zip" || archivo.type === "application/x-zip-compressed";

const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Tipo del archivo según su extensión ("" si no es uno conocido). */
export const mimePorNombre = (nombre: string) => MIME_POR_EXTENSION[nombre.split(".").pop()?.toLowerCase() ?? ""] ?? "";
