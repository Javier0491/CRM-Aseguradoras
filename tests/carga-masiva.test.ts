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

describe("carga masiva: copias repetidas", () => {
  const lista = [
    // Mismo ZIP en dos carpetas, con el mismo contenido: es una copia.
    archivo("CRM/AGREGADO/AGREGAR MONICA/0008408903.zip", 1_200_000),
    archivo("CRM/RESPALDO/AGREGAR MONICA/0008408903.zip", 1_200_000),
    // Mismo nombre, distinto contenido: la de 2023 y la renovación de 2026 se leen las dos.
    archivo("CRM/ACTUALIZAR NALLELY/0000420721.zip", 900_000),
    archivo("CRM/Renovaciones marzo 2026/0000420721.zip", 1_400_000),
    // Misma vigencia y número aunque cambie el contenido: es la misma póliza.
    archivo("CRM/enviado/24-25 619607 HECTOR/Caratula/0000619607_Caratula.pdf"),
    archivo("CRM/CRM 27 03 2024/24-25 0000619607 HECTOR/Caratula/0000619607_Caratula.pdf"),
    archivo("CRM/CRM 27 03 2024/24-25 0000619607 HECTOR/Recibos/recibo.pdf"),
  ];

  it("dice cuál se lee en su lugar y por qué", () => {
    const { unidades, repetidas } = agruparPolizas(lista);
    assert.equal(unidades.length, 4);
    assert.equal(unidades.filter((u) => u.nombre === "0000420721").length, 2);
    assert.deepEqual(
      repetidas.map((r) => [r.unidad.clave, r.original, r.motivo]),
      [
        ["CRM/enviado/24-25 619607 HECTOR", "CRM/CRM 27 03 2024/24-25 0000619607 HECTOR", "Misma vigencia 24-25 y número 619607"],
        ["CRM/RESPALDO/AGREGAR MONICA/0008408903.zip", "CRM/AGREGADO/AGREGAR MONICA/0008408903.zip", "Mismo ZIP con los mismos archivos"],
      ]
    );
  });

  it("una copia que se manda a leer aparte ya no se junta con su original", () => {
    const { unidades, repetidas } = agruparPolizas(lista, new Set(), new Set(["CRM/enviado/24-25 619607 HECTOR"]));
    assert.equal(unidades.length, 5);
    assert.equal(repetidas.length, 1);
  });
});

describe("carga masiva: ZIP con varias pólizas adentro", () => {
  // "06 10 2023.zip" guarda las pólizas de tres meses, cada una en su propio ZIP o carpeta.
  const zip = "CRM/AGREGADO/06 10 2023.zip";
  const zips = new Set([
    zip,
    `${zip}/AGOSTO 2023/23-24 0000075296 GONZALEZ BANTE.zip`,
    `${zip}/OCTUBRE 2023/0000023696 SILVIA AGUILAR.zip`,
    `${zip}/OCTUBRE 2023/Documentos79497-041340291272000000 ALEJANDRO.zip`,
    "CRM/INGRESADO/0000619607.zip",
  ]);
  const { unidades } = agruparPolizas(
    [
      archivo(zip),
      archivo(`${zip}/AGOSTO 2023/23-24 0000075296 GONZALEZ BANTE.zip`),
      archivo(`${zip}/AGOSTO 2023/23-24 0000075296 GONZALEZ BANTE.zip/Caratula/0000075296_Caratula.pdf`),
      archivo(`${zip}/AGOSTO 2023/23-24 0000075296 GONZALEZ BANTE.zip/FACT_GOBR641203512_79651397_.zip`),
      archivo(`${zip}/OCTUBRE 2023/0000023696 SILVIA AGUILAR.zip`),
      // El ZIP del portal con una carpeta adentro: el ZIP es la póliza.
      archivo(`${zip}/OCTUBRE 2023/0000023696 SILVIA AGUILAR.zip/0000023696/Caratula/0000023696_Caratula.pdf`),
      archivo(`${zip}/OCTUBRE 2023/Documentos79497-041340291272000000 ALEJANDRO.zip`),
      archivo(`${zip}/OCTUBRE 2023/Documentos79497-041340291272000000 ALEJANDRO.zip/Poliza 041340291272000000.pdf`),
      archivo(`${zip}/OCTUBRE 2023/02006_M0456755/Caratula/M0456755_Caratula.pdf`),
      archivo(`${zip}/SEPTIEMBRE 2023/GUPO INDEBIT RC/49_3877__0_0.pdf`),
      archivo(`${zip}/SEPTIEMBRE 2023/GUPO INDEBIT RC/D-12320669.pdf`),
      archivo(`${zip}/SEPTIEMBRE 2023/GUPO INDEBIT RC/HDI_RENOVACION Poliza3877-1 GRUPO INDEBIT.pdf`),
      archivo(`${zip}/__MACOSX/OCTUBRE 2023/._0000023696.zip`),
      archivo("CRM/INGRESADO/0000619607.zip"),
      archivo("CRM/INGRESADO/0000619607.zip/Caratula/0000619607_Caratula.pdf"),
    ],
    zips
  );

  it("separa el contenedor en sus pólizas y no lo trata como una", () => {
    assert.deepEqual(unidades.map((u) => [u.tipo, u.nombre]).sort(), [
      ["carpeta", "02006_M0456755"],
      ["pdf", "GUPO INDEBIT RC"],
      ["zip", "0000023696 SILVIA AGUILAR"],
      ["zip", "0000619607"],
      ["zip", "23-24 0000075296 GONZALEZ BANTE"],
      ["zip", "Documentos79497-041340291272000000 ALEJANDRO"],
    ]);
  });

  it("los documentos de la póliza son los de su ZIP, incluido el de facturas", () => {
    const gonzalez = unidades.find((u) => u.nombre.startsWith("23-24"))!;
    assert.equal(gonzalez.archivos.length, 2);
    assert.equal(unidades.find((u) => u.nombre === "GUPO INDEBIT RC")?.archivos.length, 3);
  });
});

describe("carga masiva: documentos que se leen", () => {
  it("la carátula y la factura (la copia del cliente), sin avisos de cobro ni documentos de apoyo", () => {
    const elegidos = elegirDocumentos([
      archivo("Condiciones Generales/CG MedicaLife.pdf"),
      archivo("Credenciales/T_0000000000001_GUIJARRO.pdf"),
      archivo("AC/AVISO_GUAH_81961568_0000619607__C.pdf"),
      archivo("FACT_GUAH_77605195_.zip/Factura/FACT_GUAH_81961568_0000619607_A.pdf"),
      archivo("FACT_GUAH_77605195_.zip/Factura/FACT_GUAH_81961568_0000619607_C.pdf"),
      archivo("Caratula/0000619607_Caratula_GM6029.pdf"),
    ]);
    assert.deepEqual(elegidos.map((d) => d.ruta), [
      "Caratula/0000619607_Caratula_GM6029.pdf",
      "FACT_GUAH_77605195_.zip/Factura/FACT_GUAH_81961568_0000619607_C.pdf",
    ]);
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
    zips: new Set(),
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

  it("un archivo que Windows no deja leer se deja fuera del expediente y se avisa", async () => {
    const larga = "CRM/x/24-25 02001M0064834 LAW INNOVATION/Factura/FACT_ruta_muy_larga_C.pdf";
    const conIlegible: Fuente = {
      ...fuente,
      archivos: new Map([
        ...fuente.archivos,
        [larga, { ruta: larga, tamano: 10, leer: async () => Promise.reject(new DOMException("", "NotFoundError")) }],
      ]),
    };
    const unidad = agruparPolizas([...conIlegible.archivos.values()]).unidades.find((u) => u.nombre.startsWith("24-25"))!;
    const r = await expedienteDe(unidad, conIlegible);
    assert.ok(r && "archivo" in r);
    assert.deepEqual(r.ilegibles, ["FACT_ruta_muy_larga_C.pdf"]);
    assert.equal((await leerIndiceZip(r.archivo)).length, 2);
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

  it("la póliza de grupo no manda a leer la factura", () => {
    const elegidos = elegirDocumentos([
      archivo("Caratula/M0064834_Caratula.pdf"),
      archivo("Formato de Negociación/M0064834_Formato_de_negociación_GM6036.pdf"),
      archivo("FACT_GUAH_77605195_.zip/Factura/FACT_GUAH_81961568_M0064834_C.pdf"),
    ]);
    assert.deepEqual(elegidos.map((d) => d.ruta), ["Caratula/M0064834_Caratula.pdf"]);
  });
});
