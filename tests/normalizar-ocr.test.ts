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
  it("se calcula de la referencia sin pedir verificarla, aunque no sea el número impreso", () => {
    const r = leer({}, { numeroImpreso: "0000619607" }, "MEDICA00000I11325168");
    assert.equal(r.generales.polizaVigor, "1132516");
    assert.deepEqual(r.advertencias, []);
  });

  it("una referencia con otro formato no avisa si la póliza vigor sale del número impreso", () => {
    const r = leer({}, { numeroImpreso: "0000619607" }, "12GKY34M56");
    assert.equal(r.generales.polizaVigor, "0000619607");
    assert.deepEqual(r.advertencias, []);
  });

  it("avisa cuando no hay de dónde sacar la póliza vigor", () => {
    const r = leer({}, {}, "12GKY34M56");
    assert.equal(r.generales.polizaVigor, undefined);
    assert.ok(r.advertencias.some((a) => a.includes("no tiene el formato esperado")));
  });
});
