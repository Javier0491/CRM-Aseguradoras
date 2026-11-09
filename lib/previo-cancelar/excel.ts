// Lectura del Excel "Previo a cancelar" que manda la aseguradora (p. ej. MetLife): un título
// ("Previo de Polizas a Cancelar Gastos Medicos"), la fila de encabezados y un renglón por póliza;
// al final, una fila de totales sin póliza. No importa nada de servidor: corre en el navegador.
import type { Celda, Hoja } from "@/lib/conciliacion/archivo";

export type RamoArchivo = "GMM" | "VIDA";

export type RenglonPrevio = {
  /** Número de póliza tal como viene (en MetLife, la póliza vigor: "1455495"). */
  poliza: string;
  contratante: string;
  agente: string;
  formaPago: string;
  conducto: string;
  referencia: string;
  /** YYYY-MM-DD, o "" si viene vacío. */
  pagadoHasta: string;
  primaAnual: number | null;
  primerRecibo: number | null;
  reciboSubsecuente: number | null;
};

export type ArchivoPrevio = {
  /** Título del reporte (la primera celda con texto antes de los encabezados). */
  titulo: string;
  /** Ramo que dice el título o el nombre de la hoja; null si no lo dice. */
  ramo: RamoArchivo | null;
  renglones: RenglonPrevio[];
};

/** Mayúsculas, sin acentos y solo letras, dígitos y espacios: "Póliza" → "POLIZA". */
export const claveTexto = (c: Celda | undefined) =>
  (c === null || c === undefined ? "" : String(c))
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const texto = (c: Celda | undefined) =>
  c === null || c === undefined || c instanceof Date ? "" : String(c).replace(/\s+/g, " ").trim();

function numero(c: Celda | undefined): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const t = texto(c).replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Fecha de Excel (Date, número de serie o "10/1/26" mes/día/año, como lo exporta MetLife). */
export function fechaDeCelda(c: Celda | undefined): string {
  if (c instanceof Date) return `${c.getFullYear()}-${dos(c.getMonth() + 1)}-${dos(c.getDate())}`;
  if (typeof c === "number" && c > 20_000 && c < 80_000) {
    const d = new Date(Date.UTC(1899, 11, 30) + c * 864e5);
    return d.toISOString().slice(0, 10);
  }
  const t = texto(c);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (!m) return "";
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${anio}-${dos(Number(m[1]))}-${dos(Number(m[2]))}`;
}

export function ramoDeTexto(t: string): RamoArchivo | null {
  const c = claveTexto(t);
  if (/\bVIDA\b/.test(c)) return "VIDA";
  if (/GASTOS|MEDIC|\bGMM\b|GCAYE/.test(c)) return "GMM";
  return null;
}

// Columnas por nombre de encabezado (ya en claveTexto). La póliza es la única obligatoria.
const COLUMNAS: Record<keyof RenglonPrevio, (c: string) => boolean> = {
  poliza: (c) => c === "POLIZA" || c === "NO POLIZA" || c === "NUMERO DE POLIZA" || c === "POLIZA VIGOR",
  contratante: (c) => c === "CONTRATANTE" || c === "NOMBRE CONTRATANTE" || c === "ASEGURADO",
  agente: (c) => c === "NOMBRE DE AGENTE" || c === "NOMBRE AGENTE",
  formaPago: (c) => c === "FORMA DE PAGO" || c === "FORMA PAGO",
  conducto: (c) => c === "CONDUCTO" || c === "CONDUCTO DE COBRO",
  referencia: (c) => c.startsWith("REFERENCIA"),
  pagadoHasta: (c) => c === "PAGADO HASTA",
  primaAnual: (c) => c.startsWith("PRIMA TOTAL"),
  primerRecibo: (c) => c === "PRIMA PRIMER RECIBO" || c === "PRIMER RECIBO",
  reciboSubsecuente: (c) => c.startsWith("RECIBO SUBSECUENTE"),
};

/** Filas en las que se busca el encabezado (algunas aseguradoras ponen un preámbulo). */
const MAX_FILAS_ENCABEZADO = 30;

/**
 * Lee las hojas del archivo y junta las pólizas de todas las que traigan la columna "Póliza".
 * Una póliza repetida se queda una vez. Devuelve un texto con el error si no hay nada que leer.
 */
export function leerPrevioCancelar(hojas: Hoja[]): ArchivoPrevio | string {
  let titulo = "";
  let ramo: RamoArchivo | null = null;
  const renglones = new Map<string, RenglonPrevio>();
  let conEncabezado = false;

  for (const hoja of hojas) {
    const i = hoja.filas.slice(0, MAX_FILAS_ENCABEZADO).findIndex((f) => f.some((c) => COLUMNAS.poliza(claveTexto(c))));
    if (i < 0) continue;
    conEncabezado = true;
    const tituloHoja = hoja.filas.slice(0, i).flat().map(texto).find(Boolean) ?? "";
    titulo ||= tituloHoja;
    ramo ??= ramoDeTexto(tituloHoja) ?? ramoDeTexto(hoja.nombre);

    const claves = hoja.filas[i].map(claveTexto);
    const col = Object.fromEntries(
      (Object.keys(COLUMNAS) as (keyof RenglonPrevio)[]).map((k) => [k, claves.findIndex(COLUMNAS[k])])
    ) as Record<keyof RenglonPrevio, number>;
    const celda = (f: Celda[], k: keyof RenglonPrevio) => (col[k] >= 0 ? f[col[k]] : null);

    for (const f of hoja.filas.slice(i + 1)) {
      // La fila de totales y las vacías no traen póliza.
      const poliza = texto(celda(f, "poliza")).replace(/\s+/g, "").toUpperCase();
      if (!/\d/.test(poliza) || renglones.has(poliza)) continue;
      renglones.set(poliza, {
        poliza,
        contratante: texto(celda(f, "contratante")),
        agente: texto(celda(f, "agente")),
        formaPago: texto(celda(f, "formaPago")),
        conducto: texto(celda(f, "conducto")),
        referencia: texto(celda(f, "referencia")).replace(/\s+/g, ""),
        pagadoHasta: fechaDeCelda(celda(f, "pagadoHasta")),
        primaAnual: numero(celda(f, "primaAnual")),
        primerRecibo: numero(celda(f, "primerRecibo")),
        reciboSubsecuente: numero(celda(f, "reciboSubsecuente")),
      });
    }
  }

  if (!conEncabezado) return "No encontré la columna «Póliza». ¿Es el Excel de previo a cancelar de la aseguradora?";
  if (renglones.size === 0) return "El archivo no trae ninguna póliza.";
  return { titulo, ramo, renglones: [...renglones.values()] };
}
