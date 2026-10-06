import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coberturaDeAnios, edadEnRango, rangosSeTraslapan, textoRangoEdad } from "@/lib/comisiones/reglas";
import {
  anioDePoliza,
  anioParaComision,
  antiguedadDelTitular,
  comisionEsperada,
  edadDelTitular,
  leerMonto,
  porcentajeDeEsquema,
  primaNetaDelRecibo,
  resolverPorcentaje,
  type EsquemaResolucion,
} from "@/lib/conciliacion/comisiones";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("anioDePoliza", () => {
  it("año 1 durante los primeros 12 meses y sube en cada aniversario", () => {
    assert.equal(anioDePoliza(d("2024-07-13"), d("2024-07-13")), 1);
    assert.equal(anioDePoliza(d("2024-07-13"), d("2025-07-12")), 1);
    assert.equal(anioDePoliza(d("2024-07-13"), d("2025-07-13")), 2);
    assert.equal(anioDePoliza(d("2024-07-13"), d("2026-08-01")), 3);
  });
});

describe("porcentajeDeEsquema", () => {
  const esquemas = [
    { anio_poliza: 1, porcentaje: 20 },
    { anio_poliza: 3, porcentaje: 10 },
  ];
  it("usa el mayor año definido que no exceda", () => {
    assert.deepEqual(porcentajeDeEsquema(esquemas, 1), { porcentaje: 20, anioAplicado: 1 });
    assert.deepEqual(porcentajeDeEsquema(esquemas, 2), { porcentaje: 20, anioAplicado: 1 });
    assert.deepEqual(porcentajeDeEsquema(esquemas, 7), { porcentaje: 10, anioAplicado: 3 });
  });
  it("sin año aplicable devuelve null", () => {
    assert.equal(porcentajeDeEsquema([{ anio_poliza: 2, porcentaje: 5 }], 1), null);
  });
});

describe("resolverPorcentaje", () => {
  const base = { ramo: "GMM_INDIVIDUAL", edad_minima: null, edad_maxima: null };
  const esquemas: EsquemaResolucion[] = [
    { ...base, anio_poliza: 1, porcentaje: 15 },
    { ...base, anio_poliza: 1, porcentaje: 8, edad_minima: 60, edad_maxima: null },
    { ramo: "AUTOS", anio_poliza: 1, porcentaje: 12, edad_minima: null, edad_maxima: null },
  ];
  it("el % personalizado de la póliza manda", () => {
    assert.deepEqual(resolverPorcentaje({ personalizado: 25, ramo: "GMM_INDIVIDUAL" }, 1, 30, esquemas), {
      valor: 25,
      origen: "personalizado",
      anio: null,
    });
  });
  it("la regla del rango de edad tiene prioridad", () => {
    assert.equal(resolverPorcentaje({ personalizado: null, ramo: "GMM_INDIVIDUAL" }, 1, 65, esquemas)?.valor, 8);
    assert.equal(resolverPorcentaje({ personalizado: null, ramo: "GMM_INDIVIDUAL" }, 1, 40, esquemas)?.valor, 15);
  });
  it("sin edad usa la de todas las edades; otro ramo, su propia regla", () => {
    assert.equal(resolverPorcentaje({ personalizado: null, ramo: "GMM_INDIVIDUAL" }, 1, null, esquemas)?.valor, 15);
    assert.equal(resolverPorcentaje({ personalizado: null, ramo: "AUTOS" }, 3, null, esquemas)?.valor, 12);
    assert.equal(resolverPorcentaje({ personalizado: null, ramo: "DANOS" }, 1, null, esquemas), null);
  });
});

describe("titular y antigüedad", () => {
  const asegurados = [
    { parentesco: "Hijo", orden: 1, edad: 10, fecha_nacimiento: null, antiguedad: null },
    { parentesco: "Titular", orden: 0, edad: 50, fecha_nacimiento: "1975-12-22", antiguedad: "22/12/2008" },
  ];
  it("edad del titular por su fecha de nacimiento", () => {
    assert.equal(edadDelTitular(asegurados, d("2025-12-21")), 49);
    assert.equal(edadDelTitular(asegurados, d("2025-12-22")), 50);
  });
  it("sin fecha usa la edad impresa", () => {
    assert.equal(edadDelTitular([{ parentesco: "Titular", orden: 0, edad: 33, fecha_nacimiento: null }], d("2026-01-01")), 33);
  });
  it("antigüedad en formato mexicano o ISO", () => {
    assert.equal(antiguedadDelTitular(asegurados), "2008-12-22");
    assert.equal(antiguedadDelTitular([{ parentesco: "Titular", orden: 0, edad: null, fecha_nacimiento: null, antiguedad: "31/02/2010" }]), null);
  });
  it("año para comisión por antigüedad del titular", () => {
    const r = anioParaComision({
      asegurados,
      vigenciaInicio: d("2025-07-13"),
      primeraVigencia: d("2025-07-13"),
      fechaRecibo: d("2025-07-13"),
    });
    assert.deepEqual(r, { anio: 17, por: "antiguedad", antiguedad: "2008-12-22" });
  });
  it("sin antigüedad, desde la primera vigencia de la cadena", () => {
    const r = anioParaComision({
      asegurados: [],
      vigenciaInicio: d("2026-01-01"),
      primeraVigencia: d("2024-01-01"),
      fechaRecibo: d("2026-03-01"),
    });
    assert.deepEqual(r, { anio: 3, por: "vigencias", antiguedad: null });
  });
});

describe("primaNetaDelRecibo y comisionEsperada", () => {
  const poliza = { prima_neta: 1000, vigencia_inicio: d("2026-01-01"), vigencia_fin: d("2027-01-01"), forma_pago: "TRIMESTRAL" as const };
  it("reparte la prima neta entre los recibos de la forma de pago", () => {
    assert.deepEqual(primaNetaDelRecibo(poliza, 1), { primaNeta: 250, recibos: 4 });
    assert.deepEqual(primaNetaDelRecibo(poliza, 9), { primaNeta: 250, recibos: 4 });
  });
  it("sin prima neta no se puede calcular", () => {
    assert.equal(primaNetaDelRecibo({ ...poliza, prima_neta: null }, 1), null);
  });
  it("comisión = prima neta × %", () => {
    assert.equal(comisionEsperada(250, 15), 37.5);
    assert.equal(comisionEsperada(333.33, 12.5), 41.67);
  });
});

describe("leerMonto", () => {
  it("acepta los formatos de los estados de cuenta", () => {
    assert.equal(leerMonto("$1,234.56"), 1234.56);
    assert.equal(leerMonto("1234.5 MXN"), 1234.5);
    assert.equal(leerMonto("(1,000.00)"), -1000);
    assert.equal(leerMonto(12.345), 12.35);
    assert.ok(Number.isNaN(leerMonto("N/A")));
  });
});

describe("reglas de la matriz", () => {
  it("cobertura de años", () => {
    assert.equal(coberturaDeAnios([1, 2], 1), "Año 1");
    assert.equal(coberturaDeAnios([1, 2], 2), "Año 2 en adelante");
    assert.equal(coberturaDeAnios([1, 4], 1), "Años 1 a 3");
    assert.equal(coberturaDeAnios([1], 1), "Todos los años");
  });
  it("rangos de edad", () => {
    assert.ok(edadEnRango(60, { edadMinima: 60, edadMaxima: null }));
    assert.ok(!edadEnRango(59, { edadMinima: 60, edadMaxima: null }));
    assert.ok(rangosSeTraslapan({ edadMinima: 20, edadMaxima: 40 }, { edadMinima: 40, edadMaxima: 60 }));
    assert.ok(!rangosSeTraslapan({ edadMinima: 20, edadMaxima: 39 }, { edadMinima: 40, edadMaxima: 60 }));
    assert.equal(textoRangoEdad({ edadMinima: 20, edadMaxima: 65 }), "20 a 65 años");
    assert.equal(textoRangoEdad({ edadMinima: null, edadMaxima: null }), null);
  });
});
