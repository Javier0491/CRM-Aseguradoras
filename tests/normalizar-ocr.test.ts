import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizarExtraccion } from "@/lib/ocr/normalizar";

const leer = (especificos: Record<string, unknown>, generales: Record<string, unknown> = {}, referenciaPago: string | null = null) =>
  normalizarExtraccion({ ramo: "gmm_individual", generales, especificos, referenciaPago, asegurados_lista: [] }, ["GNP"]);

describe("lectura con IA: coberturas de GMM", () => {
  it("las que no se mencionan quedan en No; las leídas se respetan", () => {
    const { especificos } = leer({ maternidad: "Sí", correccionVista: null });
    assert.equal(especificos.maternidad, "Sí");
    assert.equal(especificos.correccionVista, "No");
    assert.equal(especificos.emergenciaExtranjero, "No");
  });
});

describe("lectura con IA: póliza vigor de la referencia de pago", () => {
  it("no pide verificarla si coincide con el número impreso", () => {
    const r = leer({}, { numeroImpreso: "0001132516" }, "MEDICA00000I11325168");
    assert.equal(r.generales.polizaVigor, "1132516");
    assert.ok(!r.advertencias.some((a) => a.includes("calculada de la referencia")));
  });

  it("la pide verificar si no coincide", () => {
    const r = leer({}, { numeroImpreso: "0000619607" }, "MEDICA00000I11325168");
    assert.ok(r.advertencias.some((a) => a.includes("calculada de la referencia")));
  });
});
