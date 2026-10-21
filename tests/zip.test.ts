import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";

import { ErrorZip, extraerDeZip, leerIndiceZip, mimePorNombre } from "@/lib/archivos/zip";

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

const texto = (b: Uint8Array) => Buffer.from(b).toString("utf8");

describe("lector de ZIP", () => {
  const archivos = [
    { ruta: "Factura/", contenido: "", comprimir: false },
    { ruta: "Factura/FACT_ÑANDÚ_C.pdf", contenido: "%PDF-1.4 factura ".repeat(50) },
    { ruta: "Pago/PAGO.xml", contenido: "<cfdi/>", comprimir: false },
  ];

  it("lista los archivos (sin carpetas) y extrae comprimidos y sin comprimir", async () => {
    const zip = armarZip(archivos);
    const entradas = leerIndiceZip(zip);
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
    const zip = armarZip(archivos, new Uint8Array([0x50, 0x4b, 0x07, 0x08]));
    const [factura] = leerIndiceZip(zip);
    assert.equal(texto(await extraerDeZip(zip, factura)), archivos[1].contenido);
  });

  it("rechaza lo que no es ZIP", () => {
    assert.throws(() => leerIndiceZip(new TextEncoder().encode("%PDF-1.4 no soy zip")), ErrorZip);
  });

  it("reconoce el tipo de documento por la extensión", () => {
    assert.equal(mimePorNombre("FACT_C.PDF"), "application/pdf");
    assert.equal(mimePorNombre("foto.jpeg"), "image/jpeg");
    assert.equal(mimePorNombre("PAGO.xml"), "");
  });
});
