import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cruzarFilas, type PolizaCruce, type ReciboCruce } from "@/lib/conciliacion/cruce";
import { esHistorico, sinSeguimiento } from "@/lib/polizas/seguimiento";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("recibos históricos", () => {
  it("es histórico si venció más de 30 días antes de capturar la póliza", () => {
    assert.equal(esHistorico("2023-06-01", "2026-10-28"), true);
    assert.equal(esHistorico("2026-09-27", "2026-10-28"), true);
    // El primer recibo de una póliza nueva capturada unos días tarde sigue en seguimiento.
    assert.equal(esHistorico("2026-10-01", "2026-10-28"), false);
    assert.equal(esHistorico("2026-11-15", "2026-10-28"), false);
  });
});

describe("seguimiento de cobranza", () => {
  const vigente = { vigencia_fin: d("2027-05-01"), canceladaAt: null };
  const terminada = { vigencia_fin: d("2025-05-01"), canceladaAt: null };
  const hoy = "2026-10-28";
  it("un pendiente de una póliza vigente lleva seguimiento", () => {
    assert.equal(sinSeguimiento({ estado: "PENDIENTE", historico: false }, vigente, hoy), false);
  });
  it("no llevan seguimiento los históricos ni los de pólizas que ya terminaron", () => {
    assert.equal(sinSeguimiento({ estado: "PENDIENTE", historico: true }, vigente, hoy), true);
    assert.equal(sinSeguimiento({ estado: "PENDIENTE", historico: false }, terminada, hoy), true);
  });
  it("solo aplica a pendientes: un cobrado se muestra como cobrado", () => {
    assert.equal(sinSeguimiento({ estado: "PAGADO_MANUAL", historico: true }, terminada, hoy), false);
  });
});

describe("conciliación de un recibo pagado a mano", () => {
  const recibo = (id: string, numero: number, vence: string, extra: Partial<ReciboCruce> = {}): ReciboCruce => ({
    id, numero, monto: 250, fecha_vencimiento: d(vence), estado: "PENDIENTE", folio: null, ...extra,
  });
  const poliza: PolizaCruce = {
    id: "p1", numeroImpreso: "GMM-1234567-01", polizaVigor: "1234567", cadenaId: "p1", ramo: "GMM_INDIVIDUAL",
    vigencia_inicio: d("2026-01-01"), vigencia_fin: d("2027-01-01"), prima_total: 1200, prima_neta: 1000,
    forma_pago: "TRIMESTRAL", comision_personalizada_pct: null, cliente: { nombre: "Juan Pérez" }, asegurados: [],
    recibos: [recibo("r1", 1, "2026-01-01", { estado: "PAGADO_MANUAL" }), recibo("r2", 2, "2026-04-01")],
  };
  it("el estado de cuenta lo concilia aunque el renglón no diga el número de recibo", () => {
    const { resultados } = cruzarFilas({
      filas: [{ fila: 1, poliza: "1234567", comisionPagada: 25 }],
      usaPolizaVigor: true,
      polizas: [poliza],
      esquemas: [{ ramo: "GMM_INDIVIDUAL", anio_poliza: 1, porcentaje: 10, edad_minima: null, edad_maxima: null }],
      primerasVigencias: new Map(),
    });
    assert.equal(resultados[0].recibo?.id, "r1");
    assert.equal(resultados[0].estatus, "conciliado");
  });
});
