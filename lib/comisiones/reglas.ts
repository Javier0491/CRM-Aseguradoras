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

export const MAX_EDAD = 120;

export type RangoEdad = { edadMinima: number | null; edadMaxima: number | null };

export const esTodasLasEdades = (r: RangoEdad) => r.edadMinima === null && r.edadMaxima === null;

/** Clave del rango: las reglas con el mismo rango forman una misma tabla por año. */
export const claveRango = (r: RangoEdad) => `${r.edadMinima ?? ""}-${r.edadMaxima ?? ""}`;

/** "20 a 65 años", "Desde 70 años", "Hasta 30 años" o null si aplica a todas las edades. */
export function textoRangoEdad(r: RangoEdad): string | null {
  if (r.edadMinima !== null && r.edadMaxima !== null) {
    return r.edadMinima === r.edadMaxima ? `${r.edadMinima} años` : `${r.edadMinima} a ${r.edadMaxima} años`;
  }
  if (r.edadMinima !== null) return `Desde ${r.edadMinima} años`;
  if (r.edadMaxima !== null) return `Hasta ${r.edadMaxima} años`;
  return null;
}

export function edadEnRango(edad: number, r: RangoEdad) {
  return (r.edadMinima === null || edad >= r.edadMinima) && (r.edadMaxima === null || edad <= r.edadMaxima);
}

/** Dos rangos con límites inclusivos comparten al menos una edad. */
export function rangosSeTraslapan(a: RangoEdad, b: RangoEdad) {
  return (
    (a.edadMaxima === null || b.edadMinima === null || b.edadMinima <= a.edadMaxima) &&
    (b.edadMaxima === null || a.edadMinima === null || a.edadMinima <= b.edadMaxima)
  );
}
