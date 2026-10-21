import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc32 as crc32Zlib, deflateRawSync } from "node:zlib";

import { crearZip, ErrorZip, extraerDeZip, leerIndiceZip, mimePorNombre } from "@/lib/archivos/zip";

/** Arma un ZIP con los archivos dados (deflate o sin comprimir), como lo haría un compresor. */
function armarZip(archivos: { ruta: string; contenido: string; comprimir?: boolean }[], antepuesto = new Uint8Array()) {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let posicion = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.ruta, "utf8");
    const crudo = Buffer.from(a.contenido, "utf8");
    const datos = a.comprimir === false ? crudo : deflateRawSync(crudo);
    const metodo = a.comprimir === false ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(crudo.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(posicion, 42);
    locales.push(local, nombre, datos);
    centrales.push(central, nombre);
    posicion += 30 + nombre.length + datos.length;
  }
  const indice = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(indice.length, 12);
  fin.writeUInt32LE(posicion, 16);
  return new Uint8Array(Buffer.concat([antepuesto, ...locales, indice, fin]));
}

const FIRMA_CENTRAL = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const crc32Conocido = (t: string) => crc32Zlib(Buffer.from(t, "utf8"));
const texto = (b: Uint8Array) => Buffer.from(b).toString("utf8");

describe("lector de ZIP", () => {
  const archivos = [
    { ruta: "Factura/", contenido: "", comprimir: false },
    { ruta: "Factura/FACT_ÑANDÚ_C.pdf", contenido: "%PDF-1.4 factura ".repeat(50) },
    { ruta: "Pago/PAGO.xml", contenido: "<cfdi/>", comprimir: false },
  ];

  it("lista los archivos (sin carpetas) y extrae comprimidos y sin comprimir", async () => {
    const zip = new Blob([armarZip(archivos)]);
    const entradas = await leerIndiceZip(zip);
    assert.deepEqual(
      entradas.map((e) => [e.carpeta, e.nombre]),
      [
        ["Factura", "FACT_ÑANDÚ_C.pdf"],
        ["Pago", "PAGO.xml"],
      ]
    );
    assert.equal(texto(await extraerDeZip(zip, entradas[0])), archivos[1].contenido);
    assert.equal(texto(await extraerDeZip(zip, entradas[1])), "<cfdi/>");
  });

  it("corrige las posiciones cuando el ZIP trae bytes antepuestos (marca PK 07 08)", async () => {
    const zip = new Blob([armarZip(archivos, new Uint8Array([0x50, 0x4b, 0x07, 0x08]))]);
    const [factura] = await leerIndiceZip(zip);
    assert.equal(texto(await extraerDeZip(zip, factura)), archivos[1].contenido);
  });

  it("rechaza lo que no es ZIP", async () => {
    await assert.rejects(leerIndiceZip(new Blob(["%PDF-1.4 no soy zip"])), ErrorZip);
  });

  it("lee los nombres que el Explorador de Windows guarda en CP850 (sin UTF-8)", async () => {
    // "IÑIGUEZ Carátula.pdf" en CP850: Ñ = A5, á = A0.
    const nombre = Buffer.concat([Buffer.from("I"), Buffer.from([0xa5]), Buffer.from("IGUEZ Car"), Buffer.from([0xa0]), Buffer.from("tula.pdf")]);
    const zip = armarZip([{ ruta: "X".repeat(nombre.length), contenido: "%PDF", comprimir: false }]);
    // Se reemplaza el nombre ASCII de relleno por los bytes CP850 y se apaga la bandera UTF-8.
    const crudo = Buffer.from(zip);
    const central = crudo.indexOf(FIRMA_CENTRAL);
    for (const inicio of [30, central + 46]) nombre.copy(crudo, inicio);
    crudo.writeUInt16LE(0, 6);
    crudo.writeUInt16LE(0, central + 8);
    const [entrada] = await leerIndiceZip(new Blob([crudo]));
    assert.equal(entrada.nombre, "IÑIGUEZ Carátula.pdf");
  });

  it("arma un ZIP sin comprimir que se vuelve a leer igual", async () => {
    const zip = await crearZip([
      { ruta: "24-25 679535 MARÍA IÑIGUEZ/Caratula/0000679535_Caratula.pdf", contenido: new Blob(["%PDF-1.4 carátula"]) },
      { ruta: "24-25 679535 MARÍA IÑIGUEZ/FACT_X.zip", contenido: new Blob([armarZip(archivos)]) },
    ]);
    const entradas = await leerIndiceZip(zip);
    assert.deepEqual(entradas.map((e) => e.nombre), ["0000679535_Caratula.pdf", "FACT_X.zip"]);
    assert.equal(texto(await extraerDeZip(zip, entradas[0])), "%PDF-1.4 carátula");
    // El CRC debe ser el estándar para que cualquier descompresor lo acepte.
    assert.equal(new DataView(await zip.slice(14, 18).arrayBuffer()).getUint32(0, true), crc32Conocido("%PDF-1.4 carátula"));
  });

    it("reconoce el tipo de documento por la extensión", () => {
    assert.equal(mimePorNombre("FACT_C.PDF"), "application/pdf");
    assert.equal(mimePorNombre("foto.jpeg"), "image/jpeg");
    assert.equal(mimePorNombre("PAGO.xml"), "");
  });
});
