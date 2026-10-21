import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { leerIndiceZip } from "@/lib/archivos/zip";
import {
  agruparPolizas,
  caratulaDe,
  coincideNumero,
  elegirDocumentos,
  negociacionDe,
  numeroDeNombre,
} from "@/lib/carga-masiva/agrupar";
import { documentosDe, expedienteDe, type Fuente } from "@/lib/carga-masiva/fuente";
import { completarRfcDesdeArchivos, rfcDeNombres } from "@/lib/ocr/rfc-de-archivo";
import type { ExtraccionPoliza } from "@/lib/ocr/types";

const archivo = (ruta: string, tamano = 50_000) => ({ ruta, tamano });

describe("carga masiva: pólizas de una carpeta", () => {
  const { unidades, omitidos } = agruparPolizas([
    archivo("CRM/renovaciones agosto/24-25 619607 HECTOR GUIJARRO/Caratula/0000619607_Caratula_GM6029.pdf"),
    archivo("CRM/renovaciones agosto/24-25 619607 HECTOR GUIJARRO/Condiciones Generales/CG.pdf"),
    archivo("CRM/renovaciones agosto/24-25 619607 HECTOR GUIJARRO/FACT_GUAH_77605195_.zip"),
    // La misma póliza en otra carpeta y con el número con ceros: es una copia.
    archivo("CRM/enviado/24-25 0000619607 HECTOR GUIJARRO/Caratula/0000619607_Caratula_GM6029.pdf"),
    // Carpeta del portal sin vigencia en el nombre, pero con su subcarpeta Carátula.
    archivo("CRM/AGREGADO/02001 M0358535 CORPORATIVA/Caratula/M0358535_Caratula_GM6063.pdf"),
    archivo("CRM/AGREGADO/02001 M0358535 CORPORATIVA/Certificados/C_0000000000001_PEREZ.pdf"),
    archivo("CRM/INGRESADO/0000225513.zip"),
    archivo("CRM/INGRESADO/FACT_RAPS9005294I0_13012427.zip"),
    archivo("CRM/VICTOR ALVARADO/Poliza 041230261289000000.pdf"),
    archivo("CRM/VICTOR ALVARADO/Recibos Poliza 041230261289000000.pdf"),
    archivo("CRM/NUEVAS AGREGAR/0971110405 SERGIO DE LA TORRE.pdf"),
    archivo("CRM/RENOVACIONES NOVIEMBRE.docx"),
    archivo("CRM/desktop.ini"),
  ]);
  const por = (nombre: string) => unidades.find((u) => u.nombre.startsWith(nombre));

  it("una carpeta por póliza con todo su contenido, y las copias se descartan", () => {
    const hector = por("24-25 0000619607") ?? por("24-25 619607");
    assert.ok(hector);
    assert.equal(hector.tipo, "carpeta");
    assert.equal(hector.numero, "619607");
    assert.equal(hector.copias.length, 1);
    assert.equal(unidades.filter((u) => u.numero === "619607").length, 1);
  });

  it("reconoce la carpeta del portal por su subcarpeta Carátula", () => {
    const corp = por("02001 M0358535");
    assert.equal(corp?.archivos.length, 2);
  });

  it("ZIP sueltos y PDFs sueltos que comparten número", () => {
    assert.equal(por("0000225513")?.tipo, "zip");
    const victor = unidades.find((u) => u.clave.endsWith("#41230261289000000"));
    assert.equal(victor?.archivos.length, 2);
    assert.equal(por("0971110405")?.tipo, "pdf");
  });

  it("omite los ZIP de solo facturas y lo que no es un documento", () => {
    assert.deepEqual(omitidos.map((o) => o.ruta).sort(), ["CRM/INGRESADO/FACT_RAPS9005294I0_13012427.zip", "CRM/RENOVACIONES NOVIEMBRE.docx"]);
  });
});

describe("carga masiva: documentos que se leen", () => {
  it("la carátula y un recibo (la copia del cliente), sin documentos de apoyo", () => {
    const elegidos = elegirDocumentos([
      archivo("Condiciones Generales/CG MedicaLife.pdf"),
      archivo("Credenciales/T_0000000000001_GUIJARRO.pdf"),
      archivo("AC/AVISO_GUAH_81961568_0000619607__A.pdf"),
      archivo("AC/AVISO_GUAH_81961568_0000619607__C.pdf"),
      archivo("Caratula/0000619607_Caratula_GM6029.pdf"),
    ]);
    assert.deepEqual(elegidos.map((d) => d.ruta), ["Caratula/0000619607_Caratula_GM6029.pdf", "AC/AVISO_GUAH_81961568_0000619607__C.pdf"]);
    assert.equal(caratulaDe(elegidos)?.ruta, "Caratula/0000619607_Caratula_GM6029.pdf");
  });

  it("sin carátula usa la póliza (no la carta de bienvenida) y respeta los límites", () => {
    const elegidos = elegirDocumentos([
      archivo("Carta de Bienvenida Poliza 041340336722000000.pdf"),
      archivo("Poliza 041340336722000000.pdf"),
      archivo("Recibos Poliza 041340336722000000.pdf"),
      archivo("enorme.pdf", 30 * 1024 * 1024),
    ]);
    assert.deepEqual(elegidos.map((d) => d.ruta), ["Poliza 041340336722000000.pdf", "Recibos Poliza 041340336722000000.pdf"]);
  });

  it("compara el número del nombre con el que lee la IA", () => {
    assert.equal(numeroDeNombre("24-25 02001M0361147 ESTRAL ENERGY"), "361147");
    assert.equal(numeroDeNombre("Documentos88554-041340497896000000.zip"), "41340497896000000");
    assert.equal(numeroDeNombre("CARLA YAREELY SANCHEZ"), null);
    assert.ok(coincideNumero("619607", ["0000619607"]));
    assert.ok(coincideNumero("41340497896000000", ["", "1340497896"]));
    assert.ok(!coincideNumero("619607", ["0000620918"]));
  });
});

describe("RFC del cliente desde el nombre del archivo", () => {
  const datos = (rfcCliente: string) =>
    ({ ramo: null, generales: { rfcCliente }, especificos: {}, asegurados: [], advertencias: [] }) as unknown as ExtraccionPoliza;

  it("toma el RFC de la factura o el aviso cuando la lectura trae uno genérico o ninguno", () => {
    const nombres = ["Caratula/0000619607_Caratula_GM6029.pdf", "FACT_GUAH810713A3A_77605195_0000619607_.zip/Factura/x.pdf"];
    const r = completarRfcDesdeArchivos(datos("XAXX010101000"), nombres);
    assert.equal(r.generales.rfcCliente, "GUAH810713A3A");
    assert.match(r.advertencias[0], /genérico XAXX010101000/);
    assert.equal(completarRfcDesdeArchivos(datos(""), ["AVISO_MOIP8807062C0_77299463__C.pdf"]).generales.rfcCliente, "MOIP8807062C0");
  });

  it("no cambia un RFC real ni toma uno genérico o incompleto del nombre", () => {
    assert.equal(completarRfcDesdeArchivos(datos("ABC123456XY1"), ["FACT_GUAH810713A3A_1.pdf"]).generales.rfcCliente, "ABC123456XY1");
    assert.equal(rfcDeNombres(["FACT_XAXX010101000_1.pdf", "M0361147_Caratula_GM6063.pdf", "GUAH810713.pdf"]), null);
  });
});

describe("carga masiva: expediente y formato de negociación", () => {
  const contenido = new Map([
    ["CRM/x/24-25 02001M0064834 LAW INNOVATION/Caratula/M0064834_Caratula.pdf", "%PDF carátula"],
    ["CRM/x/24-25 02001M0064834 LAW INNOVATION/Formato de Negociación/M0064834_Formato_de_negociación_GM6036.pdf", "%PDF negociación"],
    ["CRM/x/24-25 02001M0064834 LAW INNOVATION/desktop.ini", "[.ShellClassInfo]"],
    ["CRM/INGRESADO/0000225513.zip", "PK\u0003\u0004 zip del portal"],
    ["CRM/NUEVAS/0971110405 SERGIO.pdf", "%PDF suelto"],
  ]);
  const fuente: Fuente = {
    nombre: "CRM",
    archivos: new Map(
      [...contenido].map(([ruta, texto]) => [ruta, { ruta, tamano: texto.length, leer: async () => new Blob([texto]) }])
    ),
  };
  const { unidades } = agruparPolizas([...fuente.archivos.values()]);
  const por = (inicio: string) => unidades.find((u) => u.nombre.startsWith(inicio))!;

  it("una carpeta se guarda como ZIP con su contenido, desde el nombre de la carpeta", async () => {
    const r = await expedienteDe(por("24-25"), fuente);
    assert.ok(r && "archivo" in r);
    assert.equal(r.archivo.name, "24-25 02001M0064834 LAW INNOVATION.zip");
    const rutas = (await leerIndiceZip(r.archivo)).map((e) => e.ruta).sort();
    assert.deepEqual(rutas, [
      "24-25 02001M0064834 LAW INNOVATION/Caratula/M0064834_Caratula.pdf",
      "24-25 02001M0064834 LAW INNOVATION/Formato de Negociación/M0064834_Formato_de_negociación_GM6036.pdf",
    ]);
  });

  it("un ZIP del portal se sube tal cual y un PDF suelto no lleva expediente", async () => {
    const zip = await expedienteDe(por("0000225513"), fuente);
    assert.ok(zip && "archivo" in zip && zip.archivo.name === "0000225513.zip");
    assert.equal(await expedienteDe(por("0971110405"), fuente), null);
  });

  it("encuentra el formato de negociación de la póliza de grupo", async () => {
    const docs = await documentosDe(por("24-25"), fuente);
    assert.equal(negociacionDe(docs)?.ruta, "Formato de Negociación/M0064834_Formato_de_negociación_GM6036.pdf");
    // No se manda como si fuera la carátula.
    assert.deepEqual(elegirDocumentos(docs).map((d) => d.ruta), ["Caratula/M0064834_Caratula.pdf"]);
  });
});
