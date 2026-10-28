import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizarExtraccion } from "@/lib/ocr/normalizar";
import { aseguradoVacio, validarAsegurados } from "@/lib/polizas/asegurados";
import { generarRecibos } from "@/lib/polizas/recibos";
import { mesesPorFormaPago } from "@/lib/polizas/validacion";

const ASEGURADORAS = ["Seguros Atlas", "ANA Seguros", "Insignia Life"];

describe("forma de pago cuatrimestral (ANA Seguros)", () => {
  it("son tres recibos al año, cada cuatro meses", () => {
    const recibos = generarRecibos({
      vigenciaInicio: "2025-08-27",
      vigenciaFin: "2026-08-27",
      primaTotal: 14623.89,
      mesesPorPeriodo: mesesPorFormaPago.CUATRIMESTRAL,
    });
    assert.deepEqual(
      recibos.map((r) => r.fechaVencimiento),
      ["2025-08-27", "2025-12-27", "2026-04-27"]
    );
    assert.equal(recibos.reduce((s, r) => s + Number(r.monto), 0).toFixed(2), "14623.89");
  });
  it("la lectura con IA la acepta", () => {
    const r = normalizarExtraccion(
      {
        ramo: "Autos",
        generales: { aseguradora: "ANA Seguros", numeroImpreso: "005385116", formaPago: "CUATRIMESTRAL" },
        especificos: {},
        asegurados_lista: [],
      },
      ASEGURADORAS
    );
    assert.equal(r.generales.formaPago, "CUATRIMESTRAL");
    assert.equal(r.generales.aseguradora, "ANA Seguros");
  });
});

describe("Vida Grupo (Insignia Life): cada empleado es titular", () => {
  const titular = (nombre: string) => ({ ...aseguradoVacio("Titular"), nombre });
  const empleados = [titular("LAURA DE JANEIRA GARCIA PALAFOX"), titular("PEDRO ALBERTO SANCHEZ JASSO")];

  it("en Vida Grupo se admiten varios titulares", () => {
    assert.deepEqual(validarAsegurados(empleados, { variosTitulares: true }), {});
  });
  it("en los demás ramos sigue habiendo un solo titular", () => {
    assert.ok(validarAsegurados(empleados)["asegurados.1.parentesco"]);
  });
  it("la lectura con IA conserva a todos como titulares", () => {
    const r = normalizarExtraccion(
      {
        ramo: "Vida Grupo",
        generales: { aseguradora: "Insignia Life", numeroImpreso: "101-0000011161-00", formaPago: "MENSUAL" },
        especificos: { numeroAsegurados: 2, reglaSuma: "Uniforme", sumaAsegurada: 1000000, moneda: "MXN" },
        asegurados_lista: [
          { nombre: "LAURA DE JANEIRA GARCIA PALAFOX", parentesco: "Titular", edad: 25, sexo: "Femenino" },
          { nombre: "PEDRO ALBERTO SANCHEZ JASSO", parentesco: "Titular", edad: 46, sexo: "Masculino" },
        ],
      },
      ASEGURADORAS
    );
    assert.deepEqual(r.asegurados.map((a) => a.parentesco), ["Titular", "Titular"]);
    assert.ok(!r.advertencias.some((a) => a.includes("titular")));
  });
});
