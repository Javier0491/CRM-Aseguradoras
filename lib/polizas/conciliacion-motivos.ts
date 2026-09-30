// Por qué una póliza no se ha conciliado, y qué pasa con los renglones de los estados de cuenta
// que no encontraron póliza. Lógica pura (sin base de datos), usada por Pólizas → Sin conciliar
// y por su reporte descargable.

/**
 * Motivo por el que una póliza no tiene ningún recibo conciliado, del más al menos accionable:
 * - numero_distinto: un estado de cuenta trae un número parecido que no cruzó (¿mal capturado?).
 * - no_aparece: ya hubo estados de cuenta de su aseguradora que debían incluirla y no aparece.
 * - revisar: la conciliación la encontró, pero el renglón se tiene que revisar a mano.
 * - diferencia: se cobró, pero la comisión no coincide (se aclara en Conciliación → Aclaraciones).
 * - aun_no_toca: su primer recibo vence después del último estado de cuenta conciliado.
 * - sin_estado_cuenta: todavía no se concilia ningún estado de cuenta de su aseguradora.
 */
export const TIPOS_MOTIVO = [
  "numero_distinto",
  "no_aparece",
  "revisar",
  "diferencia",
  "aun_no_toca",
  "sin_estado_cuenta",
] as const;
export type TipoMotivo = (typeof TIPOS_MOTIVO)[number];

export const etiquetaMotivo: Record<TipoMotivo, string> = {
  numero_distinto: "Número no coincide",
  no_aparece: "No aparece en el estado de cuenta",
  revisar: "Por revisar",
  diferencia: "Diferencia de comisión",
  aun_no_toca: "Aún no le toca",
  sin_estado_cuenta: "Sin estados de cuenta",
};

/**
 * Qué pasa con un renglón del estado de cuenta cuya póliza no se encontró:
 * - parecida: hay una póliza con un número parecido en el CRM (probable error de captura).
 * - registrada: la póliza ya se capturó después; falta volver a conciliar el archivo.
 * - no_registrada: la póliza no está en el CRM.
 */
export type TipoNoEncontrada = "parecida" | "registrada" | "no_registrada";

export const etiquetaNoEncontrada: Record<TipoNoEncontrada, string> = {
  parecida: "Número parecido en el CRM",
  registrada: "Ya registrada: vuelve a conciliar",
  no_registrada: "No está en el CRM",
};

/** Número reducido a letras y dígitos en mayúsculas ("AUT-987 654/03" → "AUT98765403"). */
export const normalizarNumero = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = actual;
  }
  return previa[b.length];
}

/**
 * Dos números de póliza (ya normalizados y distintos) que probablemente son la misma póliza mal
 * escrita: mismos dígitos sin letras, uno contiene al otro (prefijos o sufijos de más) o difieren
 * en uno o dos caracteres (dedo equivocado, dígitos invertidos).
 */
export function numerosParecidos(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (da.length >= 5 && da === db) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (corto.length >= 5 && largo.includes(corto)) return true;
  if (largo.length - corto.length > 2 || corto.length < 5) return false;
  return distancia(a, b) <= (largo.length >= 8 ? 2 : 1);
}
