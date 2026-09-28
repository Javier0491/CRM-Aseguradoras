// Lectura del estado de cuenta en el navegador (CSV, XLSX, XLS) y mapeo de columnas.
import { leerMonto } from "@/lib/conciliacion/comisiones";
import { MAX_FILAS_ESTADO, type FilaEstado } from "@/lib/conciliacion/tipos";

export const EXTENSIONES_ESTADO = [".csv", ".xlsx", ".xls"] as const;
export const ESTADO_MAX_BYTES = 10 * 1024 * 1024;

export type Celda = string | number | boolean | Date | null;
export type Hoja = { nombre: string; filas: Celda[][] };

/**
 * Texto de un CSV: UTF-8 si es válido; si no, Windows-1252 (lo que guarda Excel en Windows).
 * Leerlo aquí evita que SheetJS lo interprete como Latin-1 ("PÃ³liza").
 */
function decodificarCsv(bytes: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Lee todas las hojas del archivo como matrices de celdas. SheetJS se carga solo al usarse. */
export async function leerArchivoEstado(archivo: File): Promise<Hoja[]> {
  const XLSX = await import("xlsx");
  const bytes = await archivo.arrayBuffer();
  const libro = archivo.name.toLowerCase().endsWith(".csv")
    ? // raw: el CSV se lee como texto, sin convertir "1/1" (recibo) en fecha ni "001" en 1.
      XLSX.read(decodificarCsv(bytes), { type: "string", raw: true })
    : XLSX.read(bytes, { type: "array", cellDates: true });
  return libro.SheetNames.map((nombre) => ({
    nombre,
    filas: XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null }),
  }));
}

// Espacios normalizados: los encabezados de Excel suelen traer saltos de línea ("No. de⏎Póliza").
const texto = (c: Celda) => (c === null || c === undefined ? "" : String(c).replace(/\s+/g, " ").trim());

// Tolerantes a acentos mal decodificados: "Póliza" puede llegar como "PÃ³liza" en CSV de Excel.
// Cubren PÓLIZA/POLIZA en cualquier combinación de mayúsculas.
const ES_POLIZA = /p.{1,2}liza/i;
const ES_RECIBO = /recibo|no\.?\s*rec/i;

/**
 * Nombre de columna comparable: sin acentos, en mayúsculas y solo letras, dígitos, espacios
 * y "%". Repara el texto UTF-8 leído como Latin-1 ("COMISIÃ³N" → "COMISION").
 */
function claveColumna(nombre: string): string {
  let t = nombre;
  if (/[ÃÂ]/.test(t) && [...t].every((c) => c.charCodeAt(0) < 256)) {
    try {
      t = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(t, (c) => c.charCodeAt(0)));
    } catch {
      // No era mojibake: se usa tal cual.
    }
  }
  return t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * REGLA ESTRICTA: nunca es la columna de dinero, aunque diga "comisión" ("TIPO DE COMISIÓN",
 * "% COMISIÓN", "PORC. COMISIÓN", "TASA DE COMISIÓN", "ESTATUS COMISIÓN").
 */
const NO_ES_MONTO = /\bTIPO\b|%|\bPORCENTAJE\b|\bPORC\b|\bPCT\b|\bTASA\b|\bESTATUS\b|\bSTATUS\b/;

/**
 * Columna de la comisión pagada, de mayor a menor prioridad. Primero los nombres exactos de
 * comisión; luego cualquier otra columna de comisión (p. ej. "COMISIÓN DEL AGENTE"); al final
 * "IMPORTE", que solo se usa si el archivo no trae columna de comisión.
 * No se incluye la prima (p. ej. "PRIMA NETA"): no es la comisión pagada y el cruce marcaría
 * todo como diferencia; sin columna de comisión es mejor que el usuario la elija.
 */
const PRIORIDAD_MONTO: ((clave: string) => boolean)[] = [
  (c) => c === "COMISION" || c === "COMISIONES",
  (c) => c === "IMPORTE COMISION" || c === "IMPORTE DE COMISION" || c === "IMPORTE COMISIONES",
  (c) => /\bCOMISI/.test(c),
  (c) => c === "IMPORTE",
];

/** Índice de la columna de dinero según PRIORIDAD_MONTO, descartando las de NO_ES_MONTO. */
function columnaDeMonto(nombres: string[]): number | null {
  const claves = nombres.map((n) => {
    const c = claveColumna(n);
    return NO_ES_MONTO.test(c) ? null : c;
  });
  for (const coincide of PRIORIDAD_MONTO) {
    const i = claves.findIndex((c) => c !== null && coincide(c));
    if (i >= 0) return i;
  }
  return null;
}

/**
 * Filas que se revisan para encontrar el encabezado (y que ofrece el selector). Algunas
 * aseguradoras ponen un preámbulo largo: MetLife trae los encabezados en la fila 22.
 */
export const MAX_FILAS_ENCABEZADO = 50;

export type Mapeo = { poliza: number | null; comision: number | null; recibo: number | null };

/** Propone qué columna es cada dato a partir del nombre del encabezado. */
export function adivinarMapeo(encabezados: Celda[] | undefined): Mapeo {
  const nombres = (encabezados ?? []).map(texto);
  const buscar = (prueba: (n: string) => boolean) => {
    const i = nombres.findIndex(prueba);
    return i >= 0 ? i : null;
  };
  return {
    poliza: buscar((n) => ES_POLIZA.test(n) && !/vigor|tipo|ramo/i.test(n)),
    comision: columnaDeMonto(nombres),
    recibo: buscar((n) => ES_RECIBO.test(n)),
  };
}

export type Estructura = {
  /** Índice (base 0) de la fila de encabezados. */
  encabezado: number;
  mapeo: Mapeo;
  /** true si se encontró una fila con columna de póliza y de comisión. */
  detectada: boolean;
};

/**
 * Auto-detección: la primera fila (de las primeras MAX_FILAS_ENCABEZADO) con una columna de
 * PÓLIZA y una columna de dinero válida (ver columnaDeMonto), con sus columnas ya mapeadas. Se exigen celdas distintas para
 * no confundir el encabezado con un título del preámbulo ("Estado de cuenta de comisiones,
 * póliza 123"). Si ninguna cumple, la primera fila que mencione la póliza, o la primera.
 */
export function detectarEstructura(filas: Celda[][]): Estructura {
  const candidatas = filas.slice(0, MAX_FILAS_ENCABEZADO);
  const completa = candidatas.findIndex((f) => {
    const m = adivinarMapeo(f);
    return m.poliza !== null && m.comision !== null && m.poliza !== m.comision;
  });
  if (completa >= 0) return { encabezado: completa, mapeo: adivinarMapeo(candidatas[completa]), detectada: true };

  const conPoliza = candidatas.findIndex((f) => f.some((c) => ES_POLIZA.test(texto(c))));
  const encabezado = Math.max(0, conPoliza);
  return { encabezado, mapeo: adivinarMapeo(filas[encabezado]), detectada: false };
}

export type Conversion = {
  filas: FilaEstado[];
  omitidas: { fila: number; motivo: string }[];
};

/** Convierte las filas de datos (debajo del encabezado) al formato del motor de conciliación. */
export function construirFilas(filas: Celda[][], encabezado: number, mapeo: Mapeo): Conversion {
  const resultado: Conversion = { filas: [], omitidas: [] };
  if (mapeo.poliza === null || mapeo.comision === null) return resultado;

  filas.slice(encabezado + 1).forEach((celdas, i) => {
    const fila = encabezado + i + 2; // número de fila como lo ve el usuario en Excel
    if (celdas.every((c) => texto(c) === "")) return; // renglón vacío
    const poliza = texto(celdas[mapeo.poliza!]);
    const monto = leerMonto(celdas[mapeo.comision!]);
    if (!poliza) {
      // Subtítulos o renglones de totales sin póliza: se ignoran pero se informan.
      resultado.omitidas.push({ fila, motivo: "sin número de póliza" });
      return;
    }
    if (/^(sub)?totale?s?\b/i.test(poliza)) {
      resultado.omitidas.push({ fila, motivo: "renglón de totales" });
      return;
    }
    if (Number.isNaN(monto)) {
      resultado.omitidas.push({ fila, motivo: `comisión no numérica ("${texto(celdas[mapeo.comision!])}")` });
      return;
    }
    const reciboTexto = mapeo.recibo !== null ? texto(celdas[mapeo.recibo]) : "";
    const recibo = /^\d+/.exec(reciboTexto)?.[0];
    resultado.filas.push({
      fila,
      poliza,
      comisionPagada: monto,
      ...(recibo && { recibo: Number(recibo) }),
    });
  });

  if (resultado.filas.length > MAX_FILAS_ESTADO) {
    resultado.omitidas.push({ fila: 0, motivo: `el archivo supera ${MAX_FILAS_ESTADO} renglones` });
    resultado.filas = resultado.filas.slice(0, MAX_FILAS_ESTADO);
  }
  return resultado;
}
