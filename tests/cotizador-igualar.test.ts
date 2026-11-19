import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ahorroContraActual, loMejorDeLasDos, type CoberturasLeidas } from "@/lib/cotizador/igualar";
import { COBERTURAS_PREDETERMINADAS, validarDatosCotizacion, validarPolizaActual } from "@/lib/cotizador/reglas";

const nada: CoberturasLeidas = {
  paquete: null,
  deducibleDM: null,
  deducibleRT: null,
  responsabilidadCivil: null,
  gastosMedicosOcupantes: null,
  muerteConductor: null,
  rcDanosOcupantes: null,
  rcComplementariaPersonas: null,
  extras: [],
};

describe("igualar la póliza del cliente («lo mejor de las dos»)", () => {
  it("toma lo más alto de cada suma y lo más bajo de cada deducible", () => {
    const { coberturas: k } = loMejorDeLasDos(COBERTURAS_PREDETERMINADAS, {
      ...nada,
      paquete: "AMPLIA",
      deducibleDM: 10,
      deducibleRT: 5,
      responsabilidadCivil: 1_500_000,
      gastosMedicosOcupantes: 300_000,
      muerteConductor: 100_000,
      extras: ["AUTO_SUSTITUTO"],
    });
    assert.equal(k.paquete, "AMPLIA");
    assert.equal(k.deducibleDM, 5, "nuestro 5% es mejor que su 10%");
    assert.equal(k.deducibleRT, 5, "su 5% es mejor que nuestro 10%");
    assert.equal(k.responsabilidadCivil, 3_000_000, "nuestros 3 millones");
    assert.equal(k.gastosMedicosOcupantes, 300_000, "sus 300 mil");
    assert.equal(k.muerteConductor, 100_000);
    assert.deepEqual(k.extras, ["AUTO_SUSTITUTO"]);
    assert.equal(k.bonificacionMaxima, true);
  });

  it("sube a la opción que existe y no baja de lo que tiene", () => {
    const { coberturas: k, cambios } = loMejorDeLasDos(COBERTURAS_PREDETERMINADAS, {
      ...nada,
      gastosMedicosOcupantes: 250_000,
      responsabilidadCivil: 20_000_000,
      rcDanosOcupantes: 600_000,
    });
    assert.equal(k.gastosMedicosOcupantes, 300_000, "250 mil no existe: se pide 300 mil");
    assert.equal(k.responsabilidadCivil, 8_000_000, "lo más alto que se puede pedir");
    assert.equal(k.rcDanosOcupantes, 750_000, "su RC ocupantes se conserva hacia arriba");
    assert.ok(cambios.some((c) => c.includes("lo más alto que se puede pedir")));
  });

  it("nunca baja el paquete y avisa cuando el nuestro es más completo", () => {
    const limitada = loMejorDeLasDos(COBERTURAS_PREDETERMINADAS, { ...nada, paquete: "LIMITADA" });
    assert.equal(limitada.coberturas.paquete, "AMPLIA");
    assert.ok(limitada.cambios.some((c) => c.includes("más completo")));
    const deRc = loMejorDeLasDos({ ...COBERTURAS_PREDETERMINADAS, paquete: "RC" }, { ...nada, paquete: "AMPLIA" });
    assert.equal(deRc.coberturas.paquete, "AMPLIA");
  });

  it("un deducible menor al mínimo se queda en el mínimo y se avisa", () => {
    const { coberturas: k, cambios } = loMejorDeLasDos(COBERTURAS_PREDETERMINADAS, { ...nada, deducibleDM: 0 });
    assert.equal(k.deducibleDM, 3);
    assert.ok(cambios.some((c) => c.includes("lo más bajo que se puede pedir es 3%")));
  });

  it("sin datos de la póliza deja el paquete básico (con bonificación máxima)", () => {
    const { coberturas: k } = loMejorDeLasDos({ ...COBERTURAS_PREDETERMINADAS, bonificacionMaxima: false }, nada);
    assert.deepEqual({ ...k, bonificacionMaxima: false }, { ...COBERTURAS_PREDETERMINADAS, bonificacionMaxima: false });
    assert.equal(k.bonificacionMaxima, true);
  });
});

describe("ahorro contra lo que paga hoy", () => {
  it("compara la misma forma de pago", () => {
    assert.deepEqual(ahorroContraActual({ primaTotal: 14_200, formaPago: "CONTADO" }, { primaTotal: 12_000, formaPago: "CONTADO" }), {
      monto: 2_200,
      porcentaje: 15.5,
    });
    assert.deepEqual(ahorroContraActual({ primaTotal: 10_000, formaPago: null }, { primaTotal: 11_000, formaPago: "CONTADO" }), {
      monto: -1_000,
      porcentaje: -10,
    });
  });

  it("si paga en otra forma, busca esa forma en la cotización", () => {
    const nuestra = { primaTotal: 12_000, formaPago: "CONTADO", otrasFormasPago: [{ formaPago: "MENSUAL", primaTotal: 13_500 }] };
    assert.equal(ahorroContraActual({ primaTotal: 15_000, formaPago: "MENSUAL" }, nuestra)?.monto, 1_500);
    assert.equal(ahorroContraActual({ primaTotal: 15_000, formaPago: "SEMESTRAL" }, nuestra), null);
    assert.equal(ahorroContraActual({ primaTotal: null, formaPago: "CONTADO" }, nuestra), null);
    assert.equal(ahorroContraActual(null, nuestra), null);
  });
});

describe("póliza actual en la solicitud", () => {
  const base = () => ({
    aseguradora: "QUALITAS",
    vehiculo: { anio: 2020, marca: "Nissan", modelo: "Versa", version: "Advance", transmision: "AUT" },
    conductor: { codigoPostal: "45110" },
    coberturas: { ...COBERTURAS_PREDETERMINADAS },
    formaPago: "CONTADO",
  });

  it("se guarda limpia junto con la solicitud", () => {
    const v = validarDatosCotizacion(
      {
        ...base(),
        polizaActual: {
          tipoDocumento: "POLIZA",
          aseguradora: " GNP ",
          numero: "123",
          finVigencia: "2027-01-10",
          formaPago: "MENSUAL",
          primaTotal: 14_200.555,
          paquete: "Amplia",
          coberturas: [{ cobertura: "Daños materiales", sumaAsegurada: "Valor comercial", deducible: "5%", prima: 6000 }, { nada: 1 }],
        },
      },
      "2026-11-19"
    );
    assert.ok(v.ok);
    assert.deepEqual(v.valor.polizaActual, {
      tipoDocumento: "POLIZA",
      aseguradora: "GNP",
      numero: "123",
      finVigencia: "2027-01-10",
      formaPago: "MENSUAL",
      primaTotal: 14_200.56,
      paquete: "Amplia",
      coberturas: [{ cobertura: "Daños materiales", sumaAsegurada: "Valor comercial", deducible: "5%", prima: 6000 }],
    });
  });

  it("sin póliza queda en null y una póliza mal formada se rechaza", () => {
    const sin = validarDatosCotizacion(base(), "2026-11-19");
    assert.ok(sin.ok);
    assert.equal(sin.valor.polizaActual, null);
    assert.equal(validarPolizaActual({ tipoDocumento: "OTRO" }), undefined);
    assert.equal(validarPolizaActual({ tipoDocumento: "POLIZA", primaTotal: "mucho" }), undefined);
    assert.equal(validarPolizaActual({ tipoDocumento: "COTIZACION", finVigencia: "mañana" })?.finVigencia, null);
  });
});
