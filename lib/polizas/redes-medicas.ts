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

const clave = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/** Redes de una aseguradora por su nombre (sin importar mayúsculas ni acentos), o null si no está en el catálogo. */
export function redesDeAseguradora(nombre: string | undefined): readonly string[] | null {
  if (!nombre) return null;
  const buscado = clave(nombre);
  const encontrada = Object.keys(REDES_MEDICAS).find((a) => clave(a) === buscado);
  return encontrada ? REDES_MEDICAS[encontrada] : null;
}

/** Catálogo en texto para las instrucciones de la IA, una línea por aseguradora. */
export const catalogoRedesTexto = () =>
  Object.entries(REDES_MEDICAS)
    .map(([aseguradora, redes]) => `  · ${aseguradora}: ${redes.join(", ")}`)
    .join("\n");
