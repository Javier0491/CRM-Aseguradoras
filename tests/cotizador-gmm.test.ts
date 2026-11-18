import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aseguradorasDelRamo, canalDe } from "@/lib/cotizador/aseguradoras";
import { ASEGURADORAS_GMM, resumenAsegurados, validarDatosGMM } from "@/lib/cotizador/gmm";
import { aseguradorasDelRobot, nombrePdfCotizacion, validarAseguradoras, validarResultado } from "@/lib/cotizador/reglas";

const HOY = "2026-11-19";

// Familia de prueba: titular de 49, cónyuge de 46 y dos hijos.
const familia = () => ({
  aseguradora: "METLIFE",
  asegurados: [
    { parentesco: "TITULAR", nombre: " Oscar del Razo ", fechaNacimiento: "1977-03-04", sexo: "H" },
    { parentesco: "CONYUGE", nombre: "", fechaNacimiento: "1980-06-10", sexo: "M" },
    { parentesco: "HIJO", nombre: null, fechaNacimiento: "2010-01-15", sexo: "M" },
    { parentesco: "HIJO", nombre: null, fechaNacimiento: "2014-09-01", sexo: "H" },
  ],
  codigoPostal: "45110",
  estado: "JALISCO",
  municipio: " zapopan ",
  plan: "MEDIO",
  sumaAsegurada: "$5,000,000",
  deducible: 20_000,
  coaseguro: 10,
  adicionales: ["DENTAL", "DENTAL"],
  formaPago: "CONTADO",
  notas: "",
});

describe("solicitud de cotización de GMM", () => {
  it("normaliza un caso completo", () => {
    const r = validarDatosGMM(familia(), HOY);
    assert.ok(r.ok);
    assert.equal(r.valor.ramo, "GMM");
    assert.equal(r.valor.asegurados[0].nombre, "OSCAR DEL RAZO");
    assert.equal(r.valor.asegurados[1].nombre, null);
    assert.equal(r.valor.municipio, "ZAPOPAN");
    assert.equal(r.valor.sumaAsegurada, 5_000_000);
    assert.deepEqual(r.valor.adicionales, ["DENTAL"]);
    assert.equal(r.valor.notas, null);
  });

  it("deja en null lo que se pide como «el del portal»", () => {
    const r = validarDatosGMM({ ...familia(), sumaAsegurada: null, deducible: "", coaseguro: null }, HOY);
    assert.ok(r.ok);
    assert.equal(r.valor.sumaAsegurada, null);
    assert.equal(r.valor.deducible, null);
    assert.equal(r.valor.coaseguro, null);
  });

  it("exige titular primero, un solo cónyuge y fecha y sexo de todos", () => {
    const f = familia();
    assert.equal(validarDatosGMM({ ...f, asegurados: [] }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...f, asegurados: [f.asegurados[1], f.asegurados[0]] }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...f, asegurados: [f.asegurados[0], f.asegurados[0]] }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...f, asegurados: [f.asegurados[0], f.asegurados[1], f.asegurados[1]] }, HOY).ok, false);
    const sinSexo = familia();
    sinSexo.asegurados[2].sexo = "";
    assert.match((validarDatosGMM(sinSexo, HOY) as { error: string }).error, /sexo del hijo/);
    const futura = familia();
    futura.asegurados[3].fechaNacimiento = "2027-01-01";
    assert.equal(validarDatosGMM(futura, HOY).ok, false);
  });

  it("rechaza domicilio, plan, montos y adicionales inválidos", () => {
    assert.equal(validarDatosGMM({ ...familia(), aseguradora: "QUALITAS" }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), aseguradora: "constructor" }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), codigoPostal: "4511" }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), estado: "JAL" }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), municipio: " " }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), plan: "PLATINO" }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), coaseguro: 13 }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), deducible: -5 }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), sumaAsegurada: 20_000, deducible: 20_000 }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), adicionales: ["TOSTADORA"] }, HOY).ok, false);
    assert.equal(validarDatosGMM({ ...familia(), formaPago: "DIARIO" }, HOY).ok, false);
  });

  it("resume a los asegurados para la lista", () => {
    const r = validarDatosGMM(familia(), HOY);
    assert.ok(r.ok);
    assert.equal(resumenAsegurados(r.valor.asegurados, HOY), "Titular H 49 · cónyuge M 46 · 2 hijos");
    assert.equal(resumenAsegurados(r.valor.asegurados.slice(0, 1), HOY), "Titular H 49");
  });
});

describe("multicotizador de GMM", () => {
  it("Plan Seguro exige el nombre de cada asegurado; MetLife y GNP no", () => {
    const sinNombres = familia();
    assert.equal(validarDatosGMM({ ...sinNombres, aseguradora: "PLAN_SEGURO" }, HOY).ok, false);
    assert.match((validarDatosGMM({ ...sinNombres, aseguradora: "PLAN_SEGURO" }, HOY) as { error: string }).error, /Plan Seguro necesita el nombre del cónyuge/);
    assert.ok(validarDatosGMM({ ...sinNombres, aseguradora: "GNP" }, HOY).ok);
    const conNombres = familia();
    conNombres.asegurados.forEach((a, i) => (a.nombre = `PERSONA ${i}`));
    assert.ok(validarDatosGMM({ ...conNombres, aseguradora: "PLAN_SEGURO" }, HOY).ok);
  });

  it("MetLife, GNP y Plan Seguro cotizan GMM por robot", () => {
    assert.equal(canalDe("GNP", "GMM"), "ROBOT");
    assert.equal(canalDe("GNP", "AUTOS"), "ROBOT");
    assert.equal(canalDe("PLAN_SEGURO", "GMM"), "ROBOT");
    assert.deepEqual(aseguradorasDelRamo("GMM").filter((a) => a.canal === "ROBOT").map((a) => a.clave).sort(), ["GNP", "METLIFE", "PLAN_SEGURO"]);
    assert.equal(canalDe("METLIFE", "GMM"), "ROBOT");
    assert.equal(canalDe("METLIFE", "VIDA"), null);
    assert.equal(canalDe("METLIFE", "GMM", { "METLIFE:GMM": "APAGADO" }), null);
  });

  it("valida aseguradoras de GMM con su propia lista", () => {
    assert.ok(validarAseguradoras(["METLIFE", "GNP", "PLAN_SEGURO"], ASEGURADORAS_GMM).ok);
    assert.equal(validarAseguradoras(["QUALITAS"], ASEGURADORAS_GMM).ok, false);
    assert.equal(validarAseguradoras(["METLIFE"]).ok, false);
  });

  it("el robot puede pedir MetLife junto con las de autos", () => {
    assert.deepEqual(aseguradorasDelRobot("qualitas,metlife", ["QUALITAS", "METLIFE"]), ["QUALITAS", "METLIFE"]);
    assert.deepEqual(aseguradorasDelRobot("metlife"), []);
  });

  it("el PDF de GMM lleva el nombre comercial y no inventa vehículo", () => {
    assert.equal(nombrePdfCotizacion("METLIFE", "A123", undefined), "Cotizacion MetLife A123.pdf");
  });

  it("acepta el resultado que devuelve el robot de MetLife (prueba real del 2026-11-18)", () => {
    const r = validarResultado({
      numeroCotizacion: null,
      paquete: "MédicaLife Familiar Más",
      formaPago: "CONTADO",
      primaTotal: 59786.79,
      primaNeta: 50757.73,
      derechoPoliza: 782.61,
      iva: 8246.45,
      bonificacion: null,
      sumaAseguradaVehiculo: null,
      otrasFormasPago: [],
      coberturas: [
        { cobertura: "Titular H 49", sumaAsegurada: "$3,080,400", deducible: "$10,000 · coaseguro 10%", prima: 18052.93 },
        { cobertura: "Cónyuge M 46", sumaAsegurada: "$3,080,400", deducible: "$10,000 · coaseguro 10%", prima: 19082.8 },
        { cobertura: "Hija 16", sumaAsegurada: "$3,080,400", deducible: "$10,000 · coaseguro 10%", prima: 7680.98 },
        { cobertura: "Hijo 12", sumaAsegurada: "$3,080,400", deducible: "$10,000 · coaseguro 10%", prima: 5941.02 },
      ],
      avisos: ["Precio de pantalla de MetLife; no da número de cotización."],
    });
    assert.ok(r.ok);
    assert.equal(r.valor.primaTotal, 59786.79);
    assert.equal(r.valor.coberturas.reduce((t, c) => t + (c.prima ?? 0), 0).toFixed(2), "50757.73");
  });
});
