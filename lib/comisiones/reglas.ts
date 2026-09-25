// Reglas de presentación de la matriz de comisiones (compartidas por cliente y servidor).

export const MAX_ANIO_POLIZA = 50;

/**
 * Años de póliza que cubre cada regla, según cómo se aplica la matriz: un año sin regla usa
 * la del mayor año definido que no lo exceda.
 *   [1, 2]  → "Año 1", "Año 2 en adelante"
 *   [1, 4]  → "Años 1 a 3", "Año 4 en adelante"
 *   [1]     → "Todos los años"
 */
export function coberturaDeAnios(aniosDelGrupo: readonly number[], anio: number): string {
  const ordenados = [...new Set(aniosDelGrupo)].sort((a, b) => a - b);
  const siguiente = ordenados.find((a) => a > anio);
  if (siguiente === undefined) return anio === 1 ? "Todos los años" : `Año ${anio} en adelante`;
  return siguiente === anio + 1 ? `Año ${anio}` : `Años ${anio} a ${siguiente - 1}`;
}
