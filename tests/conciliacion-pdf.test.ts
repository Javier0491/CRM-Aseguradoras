import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { construirFilas, detectarEstructura } from "@/lib/conciliacion/archivo";
import {
  hojaDesdePdf,
  mismaAseguradora,
  normalizarFilasPdf,
  rescatarJsonTruncado,
} from "@/lib/conciliacion/pdf-formato";

describe("estado de cuenta en PDF", () => {
  it("la tabla leída por la IA se mapea sola y se convierte en renglones del cruce", () => {
    const filas = normalizarFilasPdf([
      ["0012345678", "3/12", "27872103", "2026-09-01", "1520.40"],
      ["0012345678", "4/12", "27872104", "2026-10-01", "1,520.40"],
      ["TSB4521873", "", "", "", "-350.00"],
      ["", "", "", "", ""],
      ["solo póliza"],
    ]);
    assert.equal(filas.length, 4);
    assert.deepEqual(filas[3], ["solo póliza", "", "", "", ""]);

    const hoja = hojaDesdePdf({ filas: filas.slice(0, 3) });
    const estructura = detectarEstructura(hoja.filas);
    assert.equal(estructura.detectada, true);
    assert.equal(estructura.encabezado, 0);
    assert.deepEqual(estructura.mapeo, { poliza: 0, comision: 4, recibo: 1, folio: 2, fecha: 3 });

    const { filas: renglones, omitidas } = construirFilas(hoja.filas, estructura.encabezado, estructura.mapeo);
    assert.equal(omitidas.length, 0);
    assert.deepEqual(renglones[0], { fila: 2, poliza: "0012345678", comisionPagada: 1520.4, recibo: 3, folio: "27872103", fecha: "2026-09-01" });
    assert.equal(renglones[1].comisionPagada, 1520.4);
    assert.deepEqual(renglones[2], { fila: 4, poliza: "TSB4521873", comisionPagada: -350 });
  });

  it("rescata los renglones completos de una respuesta cortada por el límite de salida", () => {
    const cortada =
      '{"aseguradora":"QUALITAS","periodo":"Septiembre 2026","total_comisiones":1170.4,"renglones":[["A1","1","","","100.00"],["A2","2","","","200.00"],["A3","3",""';
    const json = rescatarJsonTruncado(cortada) as { aseguradora: string; renglones: string[][] };
    assert.equal(json.aseguradora, "QUALITAS");
    assert.deepEqual(json.renglones.map((r) => r[0]), ["A1", "A2"]);
    assert.equal(rescatarJsonTruncado('{"aseguradora":null,"periodo":null'), null);
  });

  it("reconoce la aseguradora por su razón social o sus siglas", () => {
    assert.equal(mismaAseguradora("Quálitas", "QUALITAS COMPAÑIA DE SEGUROS, S.A. DE C.V."), true);
    assert.equal(mismaAseguradora("GNP", "Grupo Nacional Provincial, S.A.B."), true);
    assert.equal(mismaAseguradora("AXA", "AXA Seguros, S.A. de C.V."), true);
    assert.equal(mismaAseguradora("MetLife", "MetLife México, S.A."), true);
    assert.equal(mismaAseguradora("GNP", "AXA Seguros, S.A. de C.V."), false);
    assert.equal(mismaAseguradora("Quálitas", "Mapfre México"), false);
  });
});
