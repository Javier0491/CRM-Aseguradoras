// Agrupación de renglones del estado de cuenta que repiten el folio de un recibo.
import type { FilaEstado } from "@/lib/conciliacion/tipos";

export type FilaAgrupada = { fila: number; motivo: string };

const clavePoliza = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Un folio identifica UN recibo: varios renglones con el mismo folio (y la misma póliza) no
 * pueden ser recibos distintos. Se quedan en el primero de ellos:
 * - repetido exacto (misma comisión que otro renglón del folio): se descarta, es un duplicado;
 * - con otra comisión: es otra parte del mismo recibo (p. ej. la aseguradora desglosa la
 *   comisión en varias líneas) y se suma al primero.
 * Los renglones sin folio no se tocan. Devuelve también qué renglones se agruparon y por qué.
 */
export function agruparPorFolio(filas: readonly FilaEstado[]): { filas: FilaEstado[]; agrupadas: FilaAgrupada[] } {
  const resultado: FilaEstado[] = [];
  const agrupadas: FilaAgrupada[] = [];
  const grupos = new Map<string, { fila: FilaEstado; montos: number[] }>();

  for (const f of filas) {
    if (!f.folio) {
      resultado.push(f);
      continue;
    }
    const clave = `${clavePoliza(f.poliza)}|${f.folio.toUpperCase()}`;
    const grupo = grupos.get(clave);
    if (!grupo) {
      const copia = { ...f };
      grupos.set(clave, { fila: copia, montos: [f.comisionPagada] });
      resultado.push(copia);
      continue;
    }
    const principal = grupo.fila;
    if (grupo.montos.includes(f.comisionPagada)) {
      agrupadas.push({ fila: f.fila, motivo: `folio ${f.folio} duplicado de la fila ${principal.fila}; se descartó` });
    } else {
      principal.comisionPagada = centavos(principal.comisionPagada + f.comisionPagada);
      grupo.montos.push(f.comisionPagada);
      agrupadas.push({ fila: f.fila, motivo: `folio ${f.folio} repetido; su comisión se sumó a la fila ${principal.fila}` });
    }
    // Completa lo que el primer renglón no traía.
    if (principal.recibo === undefined && f.recibo !== undefined) principal.recibo = f.recibo;
    if (principal.fecha === undefined && f.fecha !== undefined) principal.fecha = f.fecha;
  }
  return { filas: resultado, agrupadas };
}
