import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { seccionesPorRamo, sugerenciasDeAseguradora } from "@/lib/polizas/ramos";

const campo = (nombre: string) =>
  Object.values(seccionesPorRamo).flat().flatMap((s) => s.campos).find((c) => c.name === nombre)!;

describe("sugerencias según la aseguradora", () => {
  it("los planes de Vida se filtran por aseguradora, sin importar mayúsculas ni acentos", () => {
    assert.deepEqual(sugerenciasDeAseguradora(campo("plan"), "seguros atlas"), ["MaxiPro 2002"]);
    assert.ok(sugerenciasDeAseguradora(campo("plan"), "MetLife")?.includes("PerfectLife"));
  });
  it("sin aseguradora, o una sin catálogo, ofrece todas", () => {
    const todas = campo("plan").sugerencias;
    assert.equal(sugerenciasDeAseguradora(campo("plan"), undefined), todas);
    assert.equal(sugerenciasDeAseguradora(campo("plan"), "GNP"), todas);
  });
  it("las redes médicas siguen por aseguradora", () => {
    assert.deepEqual(sugerenciasDeAseguradora(campo("redMedica"), "AXA"), ["Diamante", "Esmeralda", "Zafiro"]);
  });
});
