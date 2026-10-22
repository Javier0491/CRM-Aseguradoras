import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { crecimientoAnual } from "@/lib/reportes/crecimiento";

const poliza = (fecha: string, prima: number) => ({ inicio: new Date(`${fecha}T00:00:00Z`), prima });

describe("reportes: crecimiento por año", () => {
  const anios = crecimientoAnual(
    [
      poliza("2023-03-01", 1000),
      poliza("2025-02-10", 2000),
      poliza("2025-11-20", 2000),
      poliza("2026-01-15", 3000),
      // Inicia después de hoy: aún no cuenta.
      poliza("2026-12-01", 9000),
    ],
    "2026-10-22"
  );

  it("un renglón por año, incluidos los que no tuvieron pólizas", () => {
    assert.deepEqual(
      anios.map((a) => [a.anio, a.polizas, a.prima]),
      [
        [2023, 1, 1000],
        [2024, 0, 0],
        [2025, 2, 4000],
        [2026, 1, 3000],
      ]
    );
  });

  it("crece contra el año anterior; el año en curso contra el mismo periodo del año pasado", () => {
    assert.equal(anios[0].crecimiento, null);
    assert.equal(anios[1].crecimiento, -100);
    assert.equal(anios[2].crecimiento, null); // 2024 no tuvo prima: no hay con qué comparar
    assert.ok(anios[3].enCurso);
    assert.equal(anios[3].crecimiento, 50); // 3000 contra los 2000 de 2025 hasta el 22 de octubre
  });
});
