// Presentación de listas de coberturas capturadas como texto libre ("Otras coberturas").

/** Campos de texto que en realidad son una lista de coberturas separadas por comas. */
export const CAMPOS_LISTA_COBERTURAS = new Set(["otrasCoberturas", "coberturasAdicionales"]);

// Palabras que van en minúscula dentro de un nombre ("Asistencia en Viajes").
const MENORES = new Set(["a", "al", "con", "de", "del", "e", "el", "en", "la", "las", "los", "o", "para", "por", "sin", "u", "y"]);
// Siglas que se conservan en mayúsculas.
const SIGLAS = new Set(["GMM", "MXN", "RC", "UMA", "UMAM", "USA", "USD", "EUA", "VIH", "SIDA", "IVA"]);

/** "INCREMENTO EN TABULADOR" → "Incremento en Tabulador". El texto mixto se respeta tal cual. */
function tipoTitulo(texto: string): string {
  // Solo se normaliza lo que viene todo en mayúsculas (así suelen imprimirlo las carátulas).
  if (texto !== texto.toUpperCase()) return texto;
  return texto
    .toLowerCase()
    .split(" ")
    .map((palabra, i) => {
      const limpia = palabra.replace(/[.,]/g, "").toUpperCase();
      if (SIGLAS.has(limpia)) return palabra.toUpperCase();
      if (i > 0 && MENORES.has(palabra)) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

/**
 * Separa una lista de coberturas en elementos individuales: por comas, punto y coma, saltos
 * de línea o viñetas. Quita vacíos y repetidos.
 */
export function listaDeCoberturas(texto: string): string[] {
  const vistos = new Set<string>();
  return texto
    .split(/[,;\n•·|]+/)
    .map((c) => c.replace(/\s+/g, " ").replace(/^[\s\-–*]+|[\s.]+$/g, "").trim())
    .filter((c) => c.length > 0)
    .map(tipoTitulo)
    .filter((c) => {
      const clave = c.toLowerCase();
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
}
