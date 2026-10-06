import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { situacionCobro, sumarDias } from "@/lib/polizas/gracia";
import { generarRecibos, sumarMeses } from "@/lib/polizas/recibos";

describe("sumarMeses", () => {
  it("respeta el fin de mes", () => {
    assert.equal(sumarMeses("2026-01-31", 1), "2026-02-28");
    assert.equal(sumarMeses("2028-01-31", 1), "2028-02-29");
    assert.equal(sumarMeses("2026-03-31", 1), "2026-04-30");
  });
  it("cruza de año", () => {
    assert.equal(sumarMeses("2026-11-15", 3), "2027-02-15");
  });
});

describe("generarRecibos", () => {
  it("anual: un solo recibo por toda la prima", () => {
    const r = generarRecibos({ vigenciaInicio: "2026-01-01", vigenciaFin: "2027-01-01", primaTotal: 12345.67, mesesPorPeriodo: 12 });
    assert.deepEqual(r, [{ numero: 1, monto: "12345.67", fechaVencimiento: "2026-01-01" }]);
  });
  it("mensual: 12 recibos y los centavos sobrantes van al primero", () => {
    const r = generarRecibos({ vigenciaInicio: "2026-01-31", vigenciaFin: "2027-01-31", primaTotal: 1000, mesesPorPeriodo: 1 });
    assert.equal(r.length, 12);
    assert.equal(r[0].monto, "83.37");
    assert.ok(r.slice(1).every((x) => x.monto === "83.33"));
    const suma = r.reduce((s, x) => s + Math.round(Number(x.monto) * 100), 0);
    assert.equal(suma, 100000);
    // Fin de mes: enero 31 → febrero 28.
    assert.equal(r[1].fechaVencimiento, "2026-02-28");
  });
  it("una vigencia de un mes parcial cuenta como periodo", () => {
    const r = generarRecibos({ vigenciaInicio: "2026-01-01", vigenciaFin: "2026-07-15", primaTotal: 700, mesesPorPeriodo: 3 });
    assert.equal(r.length, 3);
  });
});

describe("situacionCobro", () => {
  it("por vencer, en gracia y en riesgo", () => {
    assert.equal(situacionCobro("2026-10-10", 30, "2026-10-05").situacion, "por_vencer");
    assert.equal(situacionCobro("2026-10-05", 30, "2026-10-05").situacion, "por_vencer");
    const gracia = situacionCobro("2026-10-01", 30, "2026-10-05");
    assert.equal(gracia.situacion, "gracia");
    assert.equal(gracia.fechaLimite, "2026-10-31");
    assert.equal(gracia.diasRestantes, 26);
    assert.equal(situacionCobro("2026-09-01", 30, "2026-10-05").situacion, "riesgo");
  });
  it("sin días de gracia, vencido es riesgo", () => {
    assert.equal(situacionCobro("2026-10-04", 0, "2026-10-05").situacion, "riesgo");
  });
  it("sumarDias", () => {
    assert.equal(sumarDias("2026-12-30", 3), "2027-01-02");
  });
});
