// Catálogo oficial de la promotoría: redes médicas (nivel hospitalario) de Gastos Médicos
// Mayores por aseguradora. La IA y el formulario solo sugieren estos nombres.
// Las claves deben coincidir con el nombre de la aseguradora registrada (prisma/seed.ts).

export const REDES_MEDICAS: Readonly<Record<string, readonly string[]>> = {
  MetLife: ["Ejecutivo", "Más", "Básico", "Amplio", "Práctico", "Red Alta", "Red Media", "Red Básica"],
  GNP: ["Premier", "Platino", "Flexible", "Índigo", "Ámbar", "Versátil"],
  AXA: ["Diamante", "Esmeralda", "Zafiro"],
  Mapfre: ["Completo", "Amplio", "Óptimo", "Esencial"],
  "Plan Seguro": ["Serie 400", "Serie 300", "Serie 200", "Serie 100"],
  "BX+": ["Plan Élite", "Plan Plus", "Plan Estándar"],
  Bupa: ["Nacional", "Internacional", "Prime", "Global", "Elite"],
};

/** Todas las redes del catálogo, sin repetir (p. ej. "Amplio" está en MetLife y Mapfre). */
export const TODAS_LAS_REDES: readonly string[] = [...new Set(Object.values(REDES_MEDICAS).flat())];

/** Catálogo en texto para las instrucciones de la IA, una línea por aseguradora. */
export const catalogoRedesTexto = () =>
  Object.entries(REDES_MEDICAS)
    .map(([aseguradora, redes]) => `  · ${aseguradora}: ${redes.join(", ")}`)
    .join("\n");
