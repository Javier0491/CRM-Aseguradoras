// Lector mínimo de ZIP para el navegador (y Node en las pruebas), sin dependencias: lista los
// archivos del índice central y descomprime solo el que se pide con DecompressionStream.
//
// Lee el ZIP por partes (Blob.slice): solo el índice y el archivo pedido pasan a memoria, así que
// sirve igual para el ZIP de facturas de un portal que para uno de varios GB con toda la cartera.
// Abrir un PDF desde el Explorador de Windows lo deja en una carpeta temporal que se borra y el
// navegador ya no lo puede leer; leerlo aquí evita ese paso.

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
/** El registro final mide 22 bytes más un comentario de hasta 64 KB. */
const COLA_MAXIMA = 22 + 0xffff;

const bytes = async (zip: Blob, desde: number, hasta: number) =>
  new Uint8Array(await zip.slice(desde, hasta).arrayBuffer());
const vistaDe = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

// Página de códigos 850 (la del Explorador de Windows en español) para los nombres que no vienen
// en UTF-8: así "IÑIGUEZ" o "Carátula" no salen con signos raros.
const CP850 =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ";
const utf8Estricto = new TextDecoder("utf-8", { fatal: true });

function decodificarNombre(b: Uint8Array, utf8: boolean): string {
  if (!utf8) {
    try {
      // Muchos compresores escriben UTF-8 sin marcarlo; si no lo es, se lee como CP850.
      return utf8Estricto.decode(b);
    } catch {
      return Array.from(b, (c) => (c < 0x80 ? String.fromCharCode(c) : CP850[c - 0x80])).join("");
    }
  }
  return new TextDecoder("utf-8").decode(b);
}

/** Lee el índice del ZIP. Lanza ErrorZip si el archivo no es un ZIP que se pueda leer. */
export async function leerIndiceZip(zip: Blob): Promise<EntradaZip[]> {
  const inicioCola = Math.max(0, zip.size - COLA_MAXIMA);
  const cola = await bytes(zip, inicioCola, zip.size);
  const vc = vistaDe(cola);
  let fin = -1;
  for (let i = cola.length - 22; i >= 0; i--) {
    if (vc.getUint32(i, true) === FIRMA_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErrorZip("El archivo no es un ZIP válido o está incompleto.");

  const total = vc.getUint16(fin + 10, true);
  const tamanoIndice = vc.getUint32(fin + 12, true);
  const posicionIndice = vc.getUint32(fin + 16, true);
  if (total === 0xffff || tamanoIndice === SIN_LIMITE_32 || posicionIndice === SIN_LIMITE_32) {
    throw new ErrorZip("El ZIP usa el formato para más de 4 GB, que no se puede abrir aquí. Elige la carpeta en su lugar.");
  }
  // El índice va justo antes del registro final. Si alguien antepuso bytes al ZIP (p. ej. la marca
  // PK 07 08 de un solo volumen), las posiciones guardadas quedan corridas por esa cantidad.
  const finAbsoluto = inicioCola + fin;
  const inicioIndice = finAbsoluto - tamanoIndice;
  const desfase = inicioIndice - posicionIndice;
  if (inicioIndice < 0 || desfase < 0) throw new ErrorZip("El índice del ZIP está dañado.");

  const indice = await bytes(zip, inicioIndice, finAbsoluto);
  const vi = vistaDe(indice);
  const entradas: EntradaZip[] = [];
  let p = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > indice.length || vi.getUint32(p, true) !== FIRMA_CENTRAL) {
      throw new ErrorZip("El índice del ZIP está dañado.");
    }
    const banderas = vi.getUint16(p + 8, true);
    const metodo = vi.getUint16(p + 10, true);
    const tamanoComprimido = vi.getUint32(p + 20, true);
    const tamano = vi.getUint32(p + 24, true);
    const largoNombre = vi.getUint16(p + 28, true);
    const largoExtra = vi.getUint16(p + 30, true);
    const largoComentario = vi.getUint16(p + 32, true);
    const local = vi.getUint32(p + 42, true);
    const nombreCrudo = indice.subarray(p + 46, p + 46 + largoNombre);
    const ruta = decodificarNombre(nombreCrudo, (banderas & 0x800) !== 0).replace(/\\/g, "/");
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
export async function extraerDeZip(zip: Blob, entrada: EntradaZip): Promise<Uint8Array<ArrayBuffer>> {
  if (entrada.cifrado) throw new ErrorZip(`«${entrada.nombre}» está protegido con contraseña.`);
  const p = entrada.inicio;
  const encabezado = await bytes(zip, p, p + 30);
  const ve = vistaDe(encabezado);
  if (encabezado.length < 30 || ve.getUint32(0, true) !== FIRMA_LOCAL) {
    throw new ErrorZip(`No se encontró «${entrada.nombre}» dentro del ZIP.`);
  }
  const desde = p + 30 + ve.getUint16(26, true) + ve.getUint16(28, true);
  const comprimido = zip.slice(desde, desde + entrada.tamanoComprimido);
  if (comprimido.size !== entrada.tamanoComprimido) throw new ErrorZip("El ZIP está incompleto.");

  if (entrada.metodo === 0) return new Uint8Array(await comprimido.arrayBuffer());
  if (entrada.metodo !== 8) {
    throw new ErrorZip(`«${entrada.nombre}» usa una compresión que no se puede abrir aquí. Extrae el ZIP en una carpeta.`);
  }
  try {
    const flujo = comprimido.stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  } catch {
    throw new ErrorZip(`«${entrada.nombre}» está dañado dentro del ZIP.`);
  }
}

export const esZip = (archivo: { name: string; type?: string }) =>
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

// Tabla del CRC-32 (el de ZIP), calculada una sola vez.
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Arma un ZIP sin comprimir (los PDF y ZIP de una póliza ya vienen comprimidos: comprimirlos otra
 * vez no ahorra casi nada). Los nombres van en UTF-8. Para expedientes: hasta 4 GB y 65 535 archivos.
 */
export async function crearZip(archivos: { ruta: string; contenido: Blob }[]): Promise<Blob> {
  const partes: BlobPart[] = [];
  const indice: Uint8Array<ArrayBuffer>[] = [];
  let posicion = 0;
  const utf8 = new TextEncoder();
  for (const a of archivos) {
    const nombre = utf8.encode(a.ruta);
    const datos = new Uint8Array(await a.contenido.arrayBuffer());
    const crc = crc32(datos);
    const local = new Uint8Array(30 + nombre.length);
    const vl = vistaDe(local);
    vl.setUint32(0, FIRMA_LOCAL, true);
    vl.setUint16(4, 20, true); // versión necesaria
    vl.setUint16(6, 0x800, true); // nombre en UTF-8
    vl.setUint32(14, crc, true);
    vl.setUint32(18, datos.length, true);
    vl.setUint32(22, datos.length, true);
    vl.setUint16(26, nombre.length, true);
    local.set(nombre, 30);

    const central = new Uint8Array(46 + nombre.length);
    const vc = vistaDe(central);
    vc.setUint32(0, FIRMA_CENTRAL, true);
    vc.setUint16(4, 20, true);
    vc.setUint16(6, 20, true);
    vc.setUint16(8, 0x800, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, datos.length, true);
    vc.setUint32(24, datos.length, true);
    vc.setUint16(28, nombre.length, true);
    vc.setUint32(42, posicion, true);
    central.set(nombre, 46);

    partes.push(local, datos);
    indice.push(central);
    posicion += local.length + datos.length;
  }
  const tamanoIndice = indice.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const vf = vistaDe(fin);
  vf.setUint32(0, FIRMA_FIN, true);
  vf.setUint16(8, archivos.length, true);
  vf.setUint16(10, archivos.length, true);
  vf.setUint32(12, tamanoIndice, true);
  vf.setUint32(16, posicion, true);
  return new Blob([...partes, ...indice, fin], { type: "application/zip" });
}
