import type { Ramo } from "@/lib/polizas/ramos";
import type { ExtraccionPoliza } from "@/lib/ocr/types";

/**
 * Contrato de cualquier motor de extracción (OCR + LLM).
 * Para conectar un proveedor real basta con implementar esta interfaz
 * y devolverla desde `getExtractor()`.
 */
export interface ExtractorPoliza {
  nombre: string;
  extraer(archivo: File): Promise<ExtraccionPoliza>;
}

const MUESTRAS: Record<Ramo, Omit<ExtraccionPoliza, "ramo">> = {
  autos: {
    aseguradora: { valor: "Quálitas", confianza: 0.98 },
    cliente: { valor: "Transportes del Bajío S.A. de C.V.", confianza: 0.94 },
    monto: { valor: 284_550.0, confianza: 0.97 },
    vigencia: { valor: { inicio: "2026-09-01", fin: "2027-09-01" }, confianza: 0.91 },
    numeroPoliza: { valor: "QUA-AU-7710452", confianza: 0.96 },
  },
  gastos_medicos: {
    aseguradora: { valor: "GNP", confianza: 0.99 },
    cliente: { valor: "María Fernanda López Ruiz", confianza: 0.95 },
    monto: { valor: 48_320.4, confianza: 0.93 },
    vigencia: { valor: { inicio: "2026-08-15", fin: "2027-08-15" }, confianza: 0.88 },
    numeroPoliza: { valor: "GNP-GM-1029384", confianza: 0.9 },
  },
  vida: {
    aseguradora: { valor: "MetLife", confianza: 0.97 },
    cliente: { valor: "Carlos Andrés Mendoza", confianza: 0.92 },
    monto: { valor: 22_910.0, confianza: 0.95 },
    vigencia: { valor: { inicio: "2026-07-01", fin: "2046-07-01" }, confianza: 0.84 },
    numeroPoliza: { valor: "MET-VI-5520193", confianza: 0.93 },
  },
  empresarial: {
    aseguradora: { valor: "AXA", confianza: 0.96 },
    cliente: { valor: "Grupo Industrial Norteño", confianza: 0.9 },
    monto: { valor: 612_400.0, confianza: 0.94 },
    vigencia: { valor: { inicio: "2026-10-01", fin: "2027-10-01" }, confianza: 0.89 },
    numeroPoliza: { valor: "AXA-DA-3301827", confianza: 0.87 },
  },
};

const PISTAS_RAMO: [RegExp, Ramo][] = [
  [/auto|flotilla|vehic/i, "autos"],
  [/gmm|medic|salud/i, "gastos_medicos"],
  [/vida/i, "vida"],
  [/empres|danos|daños|pyme|incendio/i, "empresarial"],
];

function inferirRamo(archivo: File): { ramo: Ramo; confianza: number } {
  for (const [patron, ramo] of PISTAS_RAMO) {
    if (patron.test(archivo.name)) return { ramo, confianza: 0.95 };
  }
  // Sin pistas en el nombre: elección determinista por tamaño del archivo.
  const ramos = Object.keys(MUESTRAS) as Ramo[];
  return { ramo: ramos[archivo.size % ramos.length], confianza: 0.72 };
}

/** Simulación: responde datos plausibles tras una latencia similar a la real. */
const extractorSimulado: ExtractorPoliza = {
  nombre: "simulado",
  async extraer(archivo) {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const { ramo, confianza } = inferirRamo(archivo);
    return { ...MUESTRAS[ramo], ramo: { valor: ramo, confianza } };
  },
};

export function getExtractor(): ExtractorPoliza {
  // TODO: devolver el extractor real (p. ej. OCR + Claude) cuando exista la integración.
  return extractorSimulado;
}
