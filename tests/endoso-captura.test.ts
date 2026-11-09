import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAMPOS_FIJOS_ENDOSO, combinarEndoso } from "@/lib/captura/combinar";

const actual = {
  ramo: "gmm_individual" as const,
  generales: {
    numeroImpreso: "0000685925",
    polizaVigor: "1455495",
    vigenciaInicio: "2026-07-01",
    vigenciaFin: "2027-07-01",
    formaPago: "MENSUAL",
    primaTotal: "101867.86",
    correo: "cliente@ejemplo.com",
  },
  especificos: { plazoPago: "", sumaAsegurada: "5000000" },
  asegurados: [{ nombre: "CARLOS GARIBAY", parentesco: "titular", edad: "40", antiguedad: "2019-01-01" }],
  ejecutivoId: "eje1",
};

// Lo que lee la IA de la póliza endosada: otro número y otra vigencia (no deben pasar), datos nuevos.
const leido = {
  ramo: "gmm_individual" as const,
  generales: {
    numeroImpreso: "0000685925-E01",
    polizaVigor: "9999999",
    vigenciaInicio: "2026-11-12",
    vigenciaFin: "2027-11-12",
    formaPago: "ANUAL",
    primaTotal: "120000",
    correo: "",
  },
  especificos: { sumaAsegurada: "8000000" },
  asegurados: [
    { nombre: "CARLOS GARIBAY", parentesco: "titular", edad: "40", antiguedad: "" },
    { nombre: "HIJA GARIBAY", parentesco: "hijo", edad: "12", antiguedad: "" },
  ],
};

describe("captura de un endoso", () => {
  it("conserva número, póliza vigor y vigencia, y toma lo nuevo de la póliza endosada", () => {
    const r = combinarEndoso(leido as never, actual as never, CAMPOS_FIJOS_ENDOSO);
    assert.equal(r.generales?.numeroImpreso, "0000685925");
    assert.equal(r.generales?.polizaVigor, "1455495");
    assert.equal(r.generales?.vigenciaInicio, "2026-07-01");
    assert.equal(r.generales?.vigenciaFin, "2027-07-01");
    assert.equal(r.generales?.primaTotal, "120000");
    assert.equal(r.generales?.formaPago, "ANUAL");
    // Lo que la IA no trae se queda como estaba.
    assert.equal(r.generales?.correo, "cliente@ejemplo.com");
    assert.equal(r.especificos?.sumaAsegurada, "8000000");
    assert.equal(r.asegurados?.length, 2);
    assert.equal(r.asegurados?.[0].antiguedad, "2019-01-01");
    assert.equal(r.ejecutivoId, "eje1");
  });

  it("con recibos cobrados también deja fijos la forma de pago y la prima total", () => {
    const r = combinarEndoso(leido as never, actual as never, [...CAMPOS_FIJOS_ENDOSO, "formaPago", "primaTotal", "plazoPago"]);
    assert.equal(r.generales?.formaPago, "MENSUAL");
    assert.equal(r.generales?.primaTotal, "101867.86");
  });
});
