/**
 * Monograma de una aseguradora: el nombre si es corto ("GNP"), sus siglas si empieza con ellas
 * ("AXA Seguros" → "AXA", "BX+") o sus iniciales ("Plan Seguro" → "PS").
 */
export function monograma(nombre: string) {
  const limpio = nombre.trim();
  if (limpio.length <= 4) return limpio.toUpperCase();
  const primera = limpio.split(/\s+/)[0];
  if (primera.length <= 4 && primera === primera.toUpperCase() && /[A-Z]/.test(primera)) return primera;
  const palabras = limpio.split(/\s+/).filter((p) => !/^(de|del|y|la|el|seguros?|s\.?a\.?|c\.?v\.?|,)$/i.test(p));
  const base = palabras.length > 0 ? palabras : limpio.split(/\s+/);
  return base
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** Degradado con relieve del color de la aseguradora para su monograma (gris si no tiene color). */
export function fondoMonograma(color: string | null) {
  return color
    ? `linear-gradient(150deg, color-mix(in srgb, ${color} 70%, white), ${color} 50%, color-mix(in srgb, ${color} 60%, black))`
    : "linear-gradient(150deg, #71717a, #3f3f46)";
}
