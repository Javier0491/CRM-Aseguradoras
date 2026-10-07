import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agruparPorFolio, descartarRecibosDuplicados } from "@/lib/conciliacion/agrupar";
import type { EsquemaResolucion } from "@/lib/conciliacion/comisiones";
import { cruzarFilas, type PolizaCruce, type ReciboCruce } from "@/lib/conciliacion/cruce";
import type { FilaEstado } from "@/lib/conciliacion/tipos";
import { extraerPolizaVigor, extraerPolizaVigorDeReferencia } from "@/lib/polizas/polizaParser";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function recibo(id: string, numero: number, vence: string, extra: Partial<ReciboCruce> = {}): ReciboCruce {
  return { id, numero, monto: 250, fecha_vencimiento: d(vence), estado: "PENDIENTE", folio: null, ...extra };
}

/** Póliza trimestral de $1,000 de prima neta: cada recibo tiene $250 de base de comisión. */
function poliza(extra: Partial<PolizaCruce> = {}): PolizaCruce {
  return {
    id: "p1",
    numeroImpreso: "GMM-1234567-01",
    polizaVigor: "1234567",
    cadenaId: "p1",
    ramo: "GMM_INDIVIDUAL",
    vigencia_inicio: d("2026-01-01"),
    vigencia_fin: d("2027-01-01"),
    prima_total: 1200,
    prima_neta: 1000,
    forma_pago: "TRIMESTRAL",
    comision_personalizada_pct: null,
    cliente: { nombre: "Juan Pérez" },
    asegurados: [],
    recibos: [
      recibo("r1", 1, "2026-01-01"),
      recibo("r2", 2, "2026-04-01"),
      recibo("r3", 3, "2026-07-01"),
      recibo("r4", 4, "2026-10-01"),
    ],
    ...extra,
  };
}

const esquemas: EsquemaResolucion[] = [
  { ramo: "GMM_INDIVIDUAL", anio_poliza: 1, porcentaje: 10, edad_minima: null, edad_maxima: null },
];

const fila = (n: number, extra: Partial<FilaEstado>): FilaEstado => ({ fila: n, poliza: "1234567", comisionPagada: 25, ...extra });

function cruzar(filas: FilaEstado[], polizas: PolizaCruce[] = [poliza()], usaPolizaVigor = true) {
  return cruzarFilas({ filas, usaPolizaVigor, polizas, esquemas, primerasVigencias: new Map() });
}

describe("cruce del estado de cuenta", () => {
  it("concilia el recibo pendiente más antiguo cuando la comisión coincide", () => {
    const { resultados, resumen } = cruzar([fila(1, {})]);
    assert.equal(resultados[0].estatus, "conciliado");
    assert.equal(resultados[0].recibo?.id, "r1");
    assert.equal(resultados[0].comisionEsperada, 25);
    assert.equal(resumen.conciliado, 1);
  });

  it("dentro de la tolerancia de $1 sigue conciliado; fuera, queda con diferencia", () => {
    assert.equal(cruzar([fila(1, { comisionPagada: 25.9 })]).resultados[0].estatus, "conciliado");
    const r = cruzar([fila(1, { comisionPagada: 20 })]).resultados[0];
    assert.equal(r.estatus, "diferencia");
    assert.equal(r.diferencia, -5);
  });

  it("dos renglones de la misma póliza pagan recibos distintos", () => {
    const { resultados } = cruzar([fila(1, {}), fila(2, {})]);
    assert.deepEqual(
      resultados.map((r) => r.recibo?.id),
      ["r1", "r2"]
    );
  });

  it("encuentra la póliza por póliza vigor o por número impreso", () => {
    assert.equal(cruzar([fila(1, { poliza: "GMM-1234567-03" })]).resultados[0].estatus, "conciliado");
    assert.equal(cruzar([fila(1, { poliza: "999" })]).resultados[0].estatus, "no_encontrado");
    // Sin póliza vigor (p. ej. Quálitas) solo cruza por el número impreso completo.
    assert.equal(cruzar([fila(1, { poliza: "1234567" })], [poliza()], false).resultados[0].estatus, "no_encontrado");
    assert.equal(cruzar([fila(1, { poliza: "GMM-1234567-01" })], [poliza()], false).resultados[0].estatus, "conciliado");
  });

  it("por número de recibo y por folio", () => {
    assert.equal(cruzar([fila(1, { recibo: 3 })]).resultados[0].recibo?.id, "r3");
    const conFolio = poliza({ recibos: [recibo("r1", 1, "2026-01-01"), recibo("r2", 2, "2026-04-01", { folio: "F-2" })] });
    assert.equal(cruzar([fila(1, { folio: "F-2" })], [conFolio]).resultados[0].recibo?.id, "r2");
  });

  it("un recibo ya conciliado no se vuelve a tomar", () => {
    const p = poliza({ recibos: [recibo("r1", 1, "2026-01-01", { estado: "CONCILIADO", folio: "F-1" })] });
    assert.equal(cruzar([fila(1, { folio: "F-1" })], [p]).resultados[0].estatus, "ya_conciliado");
  });

  it("un monto negativo se revisa a mano y no ocupa recibo", () => {
    const { resultados } = cruzar([fila(1, { comisionPagada: -25 }), fila(2, {})]);
    assert.equal(resultados[0].estatus, "revisar");
    assert.equal(resultados[1].recibo?.id, "r1");
  });

  it("sin recibos pendientes y con número de recibo, propone crearlo ya conciliado", () => {
    const p = poliza({ recibos: [recibo("r1", 1, "2026-01-01", { estado: "CONCILIADO" })] });
    const r = cruzar([fila(1, { recibo: 2, fecha: "2026-04-01", folio: "F-9" })], [p]).resultados[0];
    assert.equal(r.estatus, "auto_creado");
    assert.deepEqual(r.nuevoRecibo, { polizaId: "p1", numero: 2, monto: "300.00", fecha: "2026-04-01", folio: "F-9" });
  });

  it("sin folio ni número, no crea recibos (evita duplicarlos)", () => {
    const p = poliza({ recibos: [recibo("r1", 1, "2026-01-01", { estado: "CONCILIADO" })] });
    assert.equal(cruzar([fila(1, {})], [p]).resultados[0].estatus, "revisar");
  });

  it("sin prima neta o sin regla de comisión, se revisa", () => {
    assert.equal(cruzar([fila(1, {})], [poliza({ prima_neta: null })]).resultados[0].estatus, "revisar");
    assert.equal(cruzar([fila(1, {})], [poliza({ ramo: "AUTOS" })]).resultados[0].estatus, "revisar");
  });

  it("el % personalizado de la póliza reemplaza a la matriz", () => {
    const r = cruzar([fila(1, { comisionPagada: 50 })], [poliza({ comision_personalizada_pct: 20 })]).resultados[0];
    assert.equal(r.estatus, "conciliado");
    assert.equal(r.porcentaje?.origen, "personalizado");
  });

  it("un recibo cancelado solo se toma si el renglón dice cuál es", () => {
    const p = poliza({ recibos: [recibo("r1", 1, "2026-01-01", { estado: "CANCELADO" })] });
    assert.equal(cruzar([fila(1, {})], [p]).resultados[0].estatus, "revisar");
    assert.equal(cruzar([fila(1, { recibo: 1 })], [p]).resultados[0].recibo?.id, "r1");
  });

  it("el resumen separa lo comparable de lo que no tiene comisión esperada", () => {
    const { resumen } = cruzar([fila(1, {}), fila(2, { poliza: "999", comisionPagada: 10 })]);
    assert.equal(resumen.esperada, 25);
    assert.equal(resumen.pagada, 25);
    assert.equal(resumen.pagadaSinCruce, 10);
  });
});

describe("renglones repetidos", () => {
  it("agruparPorFolio descarta duplicados exactos y suma partes del mismo recibo", () => {
    const { filas, agrupadas } = agruparPorFolio([
      { fila: 1, poliza: "A-1", comisionPagada: 10, folio: "F1" },
      { fila: 2, poliza: "A-1", comisionPagada: 10, folio: "F1" },
      { fila: 3, poliza: "A-1", comisionPagada: 5, folio: "F1", recibo: 2 },
      { fila: 4, poliza: "A-1", comisionPagada: 7 },
    ]);
    assert.equal(filas.length, 2);
    assert.equal(filas[0].comisionPagada, 15);
    assert.equal(filas[0].recibo, 2);
    assert.equal(agrupadas.length, 2);
  });
  it("descartarRecibosDuplicados conserva el primero de cada recibo", () => {
    const { filas } = descartarRecibosDuplicados([
      { fila: 1, poliza: "Q-1", comisionPagada: 10, recibo: 1 },
      { fila: 2, poliza: "Q-1", comisionPagada: 11, recibo: 1 },
      { fila: 3, poliza: "Q-1", comisionPagada: 10, recibo: 2 },
    ]);
    assert.deepEqual(
      filas.map((f) => f.fila),
      [1, 3]
    );
  });
});

describe("póliza vigor", () => {
  it("quita prefijos de ramo y el consecutivo de renovación", () => {
    assert.equal(extraerPolizaVigor("GMM-1234567-01"), "1234567");
    assert.equal(extraerPolizaVigor("AUT-AB12345-03"), "AB12345");
    assert.equal(extraerPolizaVigor("QUA-AU-7710452"), "7710452");
  });
  it("desde la referencia de pago", () => {
    assert.equal(extraerPolizaVigorDeReferencia("MEDICA00000I12345670"), "1234567");
    assert.equal(extraerPolizaVigorDeReferencia("SIN-FORMATO"), null);
  });
});
