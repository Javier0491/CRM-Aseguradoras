const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normaliza a `#RRGGBB` o devuelve null si el valor no es un hex válido. */
export function normalizarHex(value: string | null | undefined): string | null {
  const match = value?.trim().match(HEX);
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${hex.toUpperCase()}`;
}

/** Color de texto legible (blanco o casi negro) sobre el fondo dado, según luminancia WCAG. */
export function colorTextoSobre(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contraste con blanco vs. con negro: se elige el mayor.
  return (1.05 / (luminancia + 0.05)) >= ((luminancia + 0.05) / 0.05) ? "#FFFFFF" : "#0A0A0A";
}
