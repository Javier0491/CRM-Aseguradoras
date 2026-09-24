// Limpieza del número de póliza leído por el OCR.

// Segmentos iniciales formados solo por letras y seguidos de un separador:
// "GMM-", "AUT-", "QUA-AU-", "VIDA / ", "GMM ".
const PREFIJO_LETRAS = /^(?:[A-Z]+(?:\s*[-_/.]\s*|\s+))+/;
// Consecutivo de renovación al final: "-01", "-02", "/03".
const SUFIJO_RENOVACION = /\s*[-_/]\s*\d{2}$/;
const NO_ALFANUMERICO = /[^A-Z0-9]/g;

/**
 * Obtiene la póliza raíz ("póliza vigor") a partir del número impreso en la carátula.
 *
 * Este valor es la llave de cruce para la conciliación bancaria: los depósitos y
 * reportes de cobranza de la aseguradora referencian la póliza raíz, sin el prefijo
 * de ramo ni el consecutivo de renovación. Por eso todas las renovaciones de una
 * misma póliza producen la misma póliza vigor.
 *
 * Ejemplos:
 *   "GMM-1234567-01"  → "1234567"
 *   "AUT-AB12345-03"  → "AB12345"
 *   "QUA-AU-7710452"  → "7710452"
 *
 * Si la limpieza dejara la cadena vacía (lectura atípica), se devuelve el número
 * impreso completo sin separadores para no perder la referencia.
 */
export function extraerPolizaVigor(numeroImpreso: string): string {
  const normalizado = numeroImpreso.trim().toUpperCase();

  const nucleo = normalizado
    .replace(PREFIJO_LETRAS, "")
    .replace(SUFIJO_RENOVACION, "")
    .replace(NO_ALFANUMERICO, "");

  // Un núcleo sin dígitos significa que el prefijo o sufijo era en realidad la póliza.
  return /\d/.test(nucleo) ? nucleo : normalizado.replace(NO_ALFANUMERICO, "");
}

/**
 * Póliza vigor a partir de la referencia de pago, para aseguradoras cuya carátula no
 * trae el número de póliza explícito (p. ej. "MEDICA00000I12345670").
 *
 * Regla de negocio: se toman los dígitos que siguen INMEDIATAMENTE a la letra "I"
 * (mayúscula o minúscula) y se elimina el último.
 *   "MEDICA00000I12345670" → "1234567"
 *   "MEDICA00000I12982553" → "1298255"
 *
 * Si hay varias "I" seguidas de dígitos, se usa la última (la de "MEDICA" no cuenta
 * porque no la siguen dígitos). Devuelve null si la referencia no sigue el formato.
 */
export function extraerPolizaVigorDeReferencia(referencia: string): string | null {
  const normalizada = referencia.replace(/\s+/g, "").toUpperCase();
  const coincidencias = [...normalizada.matchAll(/I(\d{2,})/g)];
  const digitos = coincidencias.at(-1)?.[1];
  return digitos ? digitos.slice(0, -1) : null;
}
