import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  definicionPlan,
  esCiclo,
  esEdicion,
  esPlan,
  hayCupo,
  mensajeLimiteOcr,
  mensajeLimiteUsuarios,
  periodoDe,
  textoUso,
} from "@/lib/planes/planes";

describe("planes de ZenSecure", () => {
  it("Agente: 1 usuario, Básico sin IA y Pro con 50; Broker Básico 3 usuarios y 250, Broker Pro sin límites", () => {
    const limites = (plan: "AGENTE" | "BROKER", edicion: "BASICO" | "PRO") => {
      const d = definicionPlan(plan, edicion);
      return [d.usuarios, d.ocrMensual];
    };
    assert.deepEqual(limites("AGENTE", "BASICO"), [1, 0]);
    assert.deepEqual(limites("AGENTE", "PRO"), [1, 50]);
    assert.deepEqual(limites("BROKER", "BASICO"), [3, 250]);
    assert.deepEqual(limites("BROKER", "PRO"), [null, null]);
  });

  it("precios: Agente $900 / $1,500 y Broker $2,500 / $4,500; el anual equivale a 10 mensualidades", () => {
    assert.equal(definicionPlan("AGENTE", "BASICO").precio.MENSUAL, 900);
    assert.equal(definicionPlan("AGENTE", "PRO").precio.MENSUAL, 1_500);
    assert.equal(definicionPlan("BROKER", "BASICO").precio.MENSUAL, 2_500);
    assert.equal(definicionPlan("BROKER", "PRO").precio.MENSUAL, 4_500);
    for (const plan of ["AGENTE", "BROKER"] as const) {
      for (const edicion of ["BASICO", "PRO"] as const) {
        const { precio } = definicionPlan(plan, edicion);
        assert.equal(precio.ANUAL, precio.MENSUAL * 10);
      }
    }
  });

  it("el nombre lleva la edición", () => {
    assert.equal(definicionPlan("AGENTE", "BASICO").nombre, "Agente Básico");
    assert.equal(definicionPlan("BROKER", "PRO").nombre, "Broker Pro");
  });

  it("hay cupo mientras lo usado no llegue al límite; con límite 0 nunca, sin límite siempre", () => {
    assert.equal(hayCupo(0, 1), true);
    assert.equal(hayCupo(1, 1), false);
    assert.equal(hayCupo(4, 5), true);
    assert.equal(hayCupo(5, 5), false);
    assert.equal(hayCupo(0, 0), false);
    assert.equal(hayCupo(10_000, null), true);
  });

  it("los escaneos se cargan al mes: el periodo es el día 1", () => {
    assert.equal(periodoDe("2026-10-09"), "2026-10-01");
    assert.equal(periodoDe("2026-12-31"), "2026-12-01");
  });

  it("valida plan, edición y ciclo recibidos del cliente", () => {
    assert.equal(esPlan("BROKER"), true);
    assert.equal(esPlan("broker"), false);
    assert.equal(esEdicion("PRO"), true);
    assert.equal(esEdicion("PREMIUM"), false);
    assert.equal(esCiclo("ANUAL"), true);
    assert.equal(esCiclo("SEMANAL"), false);
  });

  it("los mensajes dicen el plan y su límite", () => {
    assert.match(mensajeLimiteUsuarios("AGENTE", "PRO"), /plan Agente Pro incluye 1 usuario activo\./);
    assert.match(mensajeLimiteUsuarios("BROKER", "BASICO"), /plan Broker Básico incluye 3 usuarios activos\./);
    assert.match(mensajeLimiteOcr("BROKER", "BASICO"), /los 250 escaneos con IA de este mes del plan Broker Básico/);
    assert.match(mensajeLimiteOcr("AGENTE", "BASICO"), /Agente Básico no incluye captura con IA/);
    assert.equal(textoUso(3, 5), "3 de 5");
    assert.equal(textoUso(48_210, null), "48,210");
  });
});
