// Crecimiento de la cartera año con año: prima emitida y pólizas por año de inicio de vigencia
// (misma definición que "Prima emitida" del reporte). Función pura para poder probarla.

export type AnioCrecimiento = {
  anio: number;
  polizas: number;
  prima: number;
  /** El año actual: cuenta solo hasta hoy. */
  enCurso: boolean;
  /**
   * % de crecimiento de la prima contra el año anterior; el año en curso se compara contra el
   * mismo periodo del año pasado (1 de enero a la misma fecha). null si no hay con qué comparar.
   */
  crecimiento: number | null;
};

export function crecimientoAnual(polizas: { inicio: Date; prima: number }[], hoyIso: string): AnioCrecimiento[] {
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const anioActual = hoy.getUTCFullYear();
  // La misma fecha del año pasado, para comparar el año en curso contra un periodo igual.
  const corteAnterior = new Date(Date.UTC(anioActual - 1, hoy.getUTCMonth(), hoy.getUTCDate()));

  const porAnio = new Map<number, { polizas: number; prima: number }>();
  let primaAnteriorAlCorte = 0;
  for (const p of polizas) {
    if (p.inicio > hoy) continue; // las que inician después de hoy aún no se emiten
    const anio = p.inicio.getUTCFullYear();
    const actual = porAnio.get(anio) ?? { polizas: 0, prima: 0 };
    actual.polizas += 1;
    actual.prima += p.prima;
    porAnio.set(anio, actual);
    if (anio === anioActual - 1 && p.inicio <= corteAnterior) primaAnteriorAlCorte += p.prima;
  }
  if (porAnio.size === 0) return [];

  const desde = Math.min(...porAnio.keys());
  const anios: AnioCrecimiento[] = [];
  for (let anio = desde; anio <= anioActual; anio++) {
    const { polizas: n, prima } = porAnio.get(anio) ?? { polizas: 0, prima: 0 };
    const enCurso = anio === anioActual;
    const base = enCurso ? primaAnteriorAlCorte : (anios.at(-1)?.prima ?? 0);
    anios.push({
      anio,
      polizas: n,
      prima,
      enCurso,
      crecimiento: anio > desde && base > 0 ? ((prima - base) / base) * 100 : null,
    });
  }
  return anios;
}
