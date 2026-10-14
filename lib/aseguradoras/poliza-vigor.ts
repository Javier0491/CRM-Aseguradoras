import type { Ramo } from "@/lib/polizas/ramos";

/**
 * Ramos en los que una aseguradora que sí usa póliza vigor no la usa: su cobranza va por el número
 * de póliza completo (p. ej. AXA Autos). La clave es el nombre normalizado de la aseguradora.
 */
const RAMOS_SIN_POLIZA_VIGOR: Record<string, readonly Ramo[]> = {
  AXA: ["autos"],
};

const normalizar = (nombre: string) =>
  nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

/** Si la captura pide la póliza vigor para esta aseguradora en este ramo. */
export function usaPolizaVigorEn(aseguradora: { nombre: string; usaPolizaVigor: boolean }, ramo: Ramo): boolean {
  if (!aseguradora.usaPolizaVigor) return false;
  return !RAMOS_SIN_POLIZA_VIGOR[normalizar(aseguradora.nombre)]?.includes(ramo);
}

/**
 * Aseguradoras cuya clave de cobranza es el "Folio interno" impreso en el recibo (p. ej. SURA), no
 * una póliza vigor derivada del número de póliza: se captura tal cual y no se calcula.
 */
const CON_FOLIO_INTERNO = new Set(["SURA"]);

export const usaFolioInterno = (nombre: string | undefined) =>
  nombre !== undefined && CON_FOLIO_INTERNO.has(normalizar(nombre));
