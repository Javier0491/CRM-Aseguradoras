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

const texto = (c: Celda) => (c === null || c === undefined ? "" : String(c).trim());

// Tolerantes a acentos mal decodificados: "Póliza" puede llegar como "PÃ³liza" en CSV de Excel.
const ES_POLIZA = /p.{1,2}liza/i;
const ES_COMISION = /comisi/i;
const ES_RECIBO = /recibo|no\.?\s*rec/i;
const NO_ES_MONTO = /%|porcentaje|pct|tasa/i;

/** Primera fila (entre las 20 primeras) que parece encabezado: menciona la póliza. */
export function detectarEncabezado(filas: Celda[][]): number {
  const i = filas.slice(0, 20).findIndex((f) => f.some((c) => ES_POLIZA.test(texto(c))));
  return i >= 0 ? i : 0;
}

export type Mapeo = { poliza: number | null; comision: number | null; recibo: number | null };

/** Propone qué columna es cada dato a partir del nombre del encabezado. */
export function adivinarMapeo(encabezados: Celda[]): Mapeo {
  const nombres = encabezados.map(texto);
  const buscar = (prueba: (n: string) => boolean) => {
    const i = nombres.findIndex(prueba);
    return i >= 0 ? i : null;
  };
  return {
    poliza: buscar((n) => ES_POLIZA.test(n) && !/vigor|tipo|ramo/i.test(n)),
    comision: buscar((n) => ES_COMISION.test(n) && !NO_ES_MONTO.test(n)),
    recibo: buscar((n) => ES_RECIBO.test(n)),
  };
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
