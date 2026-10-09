import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { esCiclo, esPlan, hayCupo, mensajeLimiteOcr, mensajeLimiteUsuarios, periodoDe, PLANES, textoUso } from "@/lib/planes/planes";

describe("planes de ZenSecure", () => {
  it("Agente: 1 usuario y 50 escaneos; Broker: 5 usuarios y 500; Promotoría sin límites", () => {
    assert.deepEqual([PLANES.AGENTE.usuarios, PLANES.AGENTE.ocrMensual], [1, 50]);
    assert.deepEqual([PLANES.BROKER.usuarios, PLANES.BROKER.ocrMensual], [5, 500]);
    assert.deepEqual([PLANES.PROMOTORIA.usuarios, PLANES.PROMOTORIA.ocrMensual], [null, null]);
  });

  it("el precio anual equivale a 10 mensualidades (2 meses gratis); Promotoría se cotiza", () => {
    for (const plan of [PLANES.AGENTE, PLANES.BROKER]) assert.equal(plan.precio.ANUAL, plan.precio.MENSUAL * 10);
    assert.deepEqual(PLANES.AGENTE.precio, { MENSUAL: 900, ANUAL: 9_000 });
    assert.deepEqual(PLANES.BROKER.precio, { MENSUAL: 3_500, ANUAL: 35_000 });
    assert.equal(PLANES.PROMOTORIA.precio, null);
  });

  it("hay cupo mientras lo usado no llegue al límite; sin límite siempre hay", () => {
    assert.equal(hayCupo(0, 1), true);
    assert.equal(hayCupo(1, 1), false);
    assert.equal(hayCupo(4, 5), true);
    assert.equal(hayCupo(5, 5), false);
    assert.equal(hayCupo(6, 5), false);
    assert.equal(hayCupo(10_000, null), true);
  });

  it("los escaneos se cargan al mes: el periodo es el día 1", () => {
    assert.equal(periodoDe("2026-10-09"), "2026-10-01");
    assert.equal(periodoDe("2026-12-31"), "2026-12-01");
  });

  it("valida plan y ciclo recibidos del cliente", () => {
    assert.equal(esPlan("BROKER"), true);
    assert.equal(esPlan("broker"), false);
    assert.equal(esPlan("ENTERPRISE"), false);
    assert.equal(esCiclo("ANUAL"), true);
    assert.equal(esCiclo("SEMANAL"), false);
  });

  it("los mensajes dicen el plan y su límite", () => {
    assert.match(mensajeLimiteUsuarios("AGENTE"), /plan Agente incluye 1 usuario activo\./);
    assert.match(mensajeLimiteUsuarios("BROKER"), /plan Broker incluye 5 usuarios activos\./);
    assert.match(mensajeLimiteOcr("BROKER"), /los 500 escaneos con IA de este mes del plan Broker/);
    assert.equal(textoUso(3, 5), "3 de 5");
    assert.equal(textoUso(12, null), "12");
    assert.equal(textoUso(48_210, null), "48,210");
  });
});
