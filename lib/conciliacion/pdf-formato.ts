// Estado de cuenta en PDF leído con IA: forma de la respuesta y su conversión a una hoja para el
// mapeo de columnas (compartido por el servidor y el navegador).

import type { Celda, Hoja } from "@/lib/conciliacion/archivo";

/** Encabezados de la tabla que devuelve la IA; el mapeo automático los reconoce. */
export const ENCABEZADOS_PDF = ["Póliza", "Recibo", "Folio", "Fecha de inicio", "Comisión"] as const;
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

export type LecturaPdf = {
  /** Renglones en el orden de ENCABEZADOS_PDF, como texto tal cual viene en el PDF. */
  filas: string[][];
  /** Aseguradora y periodo impresos en el PDF, si los trae. */
  aseguradora: string | null;
  periodo: string | null;
  /** Total de comisiones impreso en el PDF, para cuadrar lo leído. */
  totalImpreso: number | null;
  /** La IA se quedó sin espacio antes de terminar: faltan renglones. */
  incompleto: boolean;
};

export type LecturaPdfRespuesta = ({ ok: true } & LecturaPdf) | { ok: false; error: string };

/** Hoja con la tabla leída, lista para detectarEstructura y la vista previa. */
export function hojaDesdePdf(lectura: Pick<LecturaPdf, "filas">, nombre = "Leído con IA"): Hoja {
  return { nombre, filas: [[...ENCABEZADOS_PDF], ...lectura.filas.map((f) => f.map((c): Celda => c || null))] };
}

/**
 * Renglones válidos de la respuesta de la IA: exactamente cinco textos por renglón (se completan o
 * recortan) y sin renglones vacíos.
 */
export function normalizarFilasPdf(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is unknown[] => Array.isArray(f))
    .map((f) =>
      Array.from({ length: ENCABEZADOS_PDF.length }, (_, i) =>
        typeof f[i] === "string" || typeof f[i] === "number" ? String(f[i]).replace(/\s+/g, " ").trim().slice(0, 80) : ""
      )
    )
    .filter((f) => f[0] !== "" || f[4] !== "");
}

/**
 * JSON cortado porque la IA llegó a su límite de salida: se conserva hasta el último renglón
 * completo de `renglones` y se cierra el JSON. null si no se puede rescatar.
 */
export function rescatarJsonTruncado(texto: string): unknown {
  const inicio = texto.indexOf('"renglones"');
  if (inicio < 0) return null;
  // Último renglón completo: termina en `"]` (cadena seguida del cierre del arreglo).
  const fin = texto.lastIndexOf('"]');
  if (fin < inicio) return null;
  try {
    return JSON.parse(`${texto.slice(0, fin + 2)}]}`);
  } catch {
    return null;
  }
}

const normalizarNombre = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    // "S.A.B." → "SAB": las abreviaturas quedan en una sola palabra.
    .replace(/\./g, "")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** Palabras que no distinguen a una aseguradora ("Seguros", "S.A. de C.V."). */
const GENERICAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "Y", "S", "A", "C", "V", "SA", "CV", "SAB", "SEGUROS", "COMPANIA", "MEXICO"]);

/**
 * ¿El nombre impreso en el PDF corresponde a la aseguradora elegida? Tolera razones sociales
 * ("QUALITAS COMPAÑIA DE SEGUROS, S.A. DE C.V." es Quálitas) y siglas ("Grupo Nacional
 * Provincial" es GNP). Ante la duda dice que sí: solo sirve para advertir.
 */
export function mismaAseguradora(elegida: string, impresa: string) {
  const a = normalizarNombre(elegida);
  const b = normalizarNombre(impresa);
  if (!a || !b || a.includes(b) || b.includes(a)) return true;
  const palabras = (s: string) => s.split(" ").filter((p) => !GENERICAS.has(p));
  const [pa, pb] = [palabras(a), palabras(b)];
  if (pa.length === 0 || pb.length === 0 || pa[0] === pb[0]) return true;
  const siglas = (ps: string[]) => ps.map((p) => p[0]).join("");
  return pa.join("") === siglas(pb) || pb.join("") === siglas(pa);
}
