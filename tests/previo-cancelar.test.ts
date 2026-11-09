import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fechaDeCelda, leerPrevioCancelar } from "@/lib/previo-cancelar/excel";
import { fechaLarga, fechasPropuestas, mensajePrevioCancelar, ramoAviso, referenciaPrevio } from "@/lib/previo-cancelar/mensaje";

// Así llega el reporte de MetLife: título, encabezados, pólizas y una fila de totales.
const METLIFE = {
  nombre: "GCAYEPRECANG90661261101",
  filas: [
    ["Previo de Polizas a Cancelar Gastos Medicos", " ", " ", null],
    [
      "Numero de Agente",
      "Nombre de Agente",
      "Poliza",
      "Contratante",
      "Moneda",
      "Prima Total Anual",
      "Prima Dep",
      "Forma de Pago",
      "Conducto",
      "Referencia Bancaria",
      "Pagado Hasta",
      "Prima Primer Recibo",
      "Recibo Subsecuente",
    ],
    ["12959", "LESLY JANET", 1455495, "CARLOS ROBERTO", "M.NACIONAL", 101867.86, 0, "MENSUAL S REC", "TARJ.CRED.", "MEDICA00000I14554954", "10/1/26", 9658.6, 8382.66],
    ["12959", "LESLY JANET", "1459462", "ARLETTE", "M.NACIONAL", "161202.16", "0", "ANUAL", "AGENTE", "MEDICA00000I14594620", null, "161202.16", "0"],
    ["12959", "LESLY JANET", "1459462", "REPETIDA", null, null, null, null, null, null, null, null, null],
    [" ", " ", " ", " ", " ", 6362459.27, 0, " ", " ", " ", " ", " ", null],
  ],
};

describe("Excel de previo a cancelar", () => {
  it("lee las pólizas del reporte de MetLife y descarta totales y repetidas", () => {
    const r = leerPrevioCancelar([METLIFE]);
    assert.ok(typeof r !== "string");
    assert.equal(r.titulo, "Previo de Polizas a Cancelar Gastos Medicos");
    assert.equal(r.ramo, "GMM");
    assert.deepEqual(
      r.renglones.map((x) => x.poliza),
      ["1455495", "1459462"]
    );
    const [primera, segunda] = r.renglones;
    assert.equal(primera.contratante, "CARLOS ROBERTO");
    assert.equal(primera.referencia, "MEDICA00000I14554954");
    assert.equal(primera.pagadoHasta, "2026-10-01");
    assert.equal(primera.reciboSubsecuente, 8382.66);
    assert.equal(segunda.pagadoHasta, "");
    assert.equal(segunda.primaAnual, 161202.16);
  });

  it("reconoce Vida por el título y explica cuando no es el archivo", () => {
    const vida = { nombre: "Hoja1", filas: [["Previo de Polizas a Cancelar Vida"], ["Poliza", "Contratante"], ["123", "X"]] };
    const r = leerPrevioCancelar([vida]);
    assert.ok(typeof r !== "string" && r.ramo === "VIDA");
    assert.equal(typeof leerPrevioCancelar([{ nombre: "x", filas: [["Folio", "Monto"], ["1", "2"]] }]), "string");
    assert.equal(typeof leerPrevioCancelar([{ nombre: "x", filas: [["Poliza"], [" "]] }]), "string");
  });

  it("convierte las fechas de Excel", () => {
    assert.equal(fechaDeCelda("10/6/26"), "2026-10-06");
    assert.equal(fechaDeCelda(new Date(2026, 9, 6)), "2026-10-06");
    assert.equal(fechaDeCelda(46301), "2026-10-06");
    assert.equal(fechaDeCelda(" "), "");
  });
});

describe("aviso de previo a cancelar", () => {
  it("redacta el texto con el ramo, el mes y las dos fechas", () => {
    const { asunto, mensaje } = mensajePrevioCancelar({
      ramo: ramoAviso("GMM_INDIVIDUAL"),
      poliza: "1455495",
      aseguradora: "MetLife",
      fechaVentanilla: "2026-11-19",
      fechaPortal: "2026-11-20",
      referencia: "MEDICA00000I14554954",
    });
    assert.match(asunto, /1455495/);
    assert.match(
      mensaje,
      /Esta póliza de GASTOS MÉDICOS \(número 1455495\) está previa a cancelar en el mes de NOVIEMBRE, para evitar su cancelación debe de pagarse máximo el día 19 de noviembre del 2026 en ventanilla bancaria o el 20 de noviembre del 2026 en portal de MetLife\./
    );
    assert.match(mensaje, /MEDICA00000I14554954/);
    assert.match(mensaje, /no corre riesgo de cancelación/);
    assert.equal(ramoAviso("VIDA_GRUPO"), "VIDA");
  });

  it("propone el 19 y el 20 del mes y avisa una vez por póliza y mes", () => {
    assert.deepEqual(fechasPropuestas("2026-11-09"), { ventanilla: "2026-11-19", portal: "2026-11-20" });
    assert.equal(fechaLarga("2026-01-05"), "5 de enero del 2026");
    assert.equal(referenciaPrevio("abc", "2026-11-19"), "abc:2026-11");
  });
});
