// Generación del calendario de recibos de una póliza (función pura).

export type ReciboGenerado = {
  numero: number;
  /** Monto con dos decimales, como string para no perder precisión. */
  monto: string;
  /** Fecha ISO yyyy-mm-dd. */
  fechaVencimiento: string;
};

function parseFecha(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** Suma meses respetando fin de mes (31 ene + 1 mes = 28/29 feb). */
export function sumarMeses(iso: string, meses: number): string {
  const { y, m, d } = parseFecha(iso);
  const objetivo = new Date(Date.UTC(y, m + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)
  ).getUTCDate();
  objetivo.setUTCDate(Math.min(d, ultimoDia));
  return objetivo.toISOString().slice(0, 10);
}

/** Meses completos entre dos fechas; un mes parcial cuenta como periodo. */
function mesesEntre(inicio: string, fin: string) {
  const a = parseFecha(inicio);
  const b = parseFecha(fin);
  const meses = (b.y - a.y) * 12 + (b.m - a.m);
  return b.d > a.d ? meses + 1 : meses;
}

/**
 * Años de una vigencia, al año más cercano (del 15/03/2024 al 14/03/2044 → 20). Nunca menos
 * de 1. null si alguna fecha falta o el fin no es posterior al inicio.
 */
export function aniosDeVigencia(inicio: string, fin: string): number | null {
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(inicio) || !fecha.test(fin) || fin <= inicio) return null;
  return Math.max(1, Math.round(mesesEntre(inicio, fin) / 12));
}

/**
 * Último día de pagos de una póliza de pago limitado: el inicio más los años de pago, sin pasar
 * del fin de vigencia. Sin plazo de pago (o uno inválido) se paga toda la vigencia.
 */
export function finDePagos(inicio: string, fin: string, aniosPago?: number): string {
  if (!aniosPago || !Number.isInteger(aniosPago) || aniosPago < 1) return fin;
  const finPagos = sumarMeses(inicio, aniosPago * 12);
  return finPagos < fin ? finPagos : fin;
}

/**
 * Reparte la prima total en recibos según la forma de pago.
 * Cada recibo vence al inicio de su periodo. Los centavos sobrantes del
 * reparto se asignan al primer recibo para que la suma sea exacta.
 * Con `primaAnual` (Vida) la prima es la de un año: se reparte entre los recibos de cada año y
 * se repite hasta el fin de la vigencia; los centavos sobrantes van al primer recibo de cada año.
 */
export function generarRecibos({
  vigenciaInicio,
  vigenciaFin,
  primaTotal,
  mesesPorPeriodo,
  primaAnual = false,
}: {
  vigenciaInicio: string;
  vigenciaFin: string;
  primaTotal: number;
  mesesPorPeriodo: number;
  primaAnual?: boolean;
}): ReciboGenerado[] {
  const periodos = Math.max(1, Math.ceil(mesesEntre(vigenciaInicio, vigenciaFin) / mesesPorPeriodo));
  // Recibos entre los que se reparte la prima: los de un año, o los de toda la vigencia.
  const reparto = primaAnual ? Math.max(1, Math.round(12 / mesesPorPeriodo)) : periodos;
  const centavos = Math.round(primaTotal * 100);
  const base = Math.floor(centavos / reparto);
  const residuo = centavos - base * reparto;

  return Array.from({ length: periodos }, (_, i) => {
    const monto = base + (i % reparto === 0 ? residuo : 0);
    return {
      numero: i + 1,
      monto: (monto / 100).toFixed(2),
      fechaVencimiento: sumarMeses(vigenciaInicio, i * mesesPorPeriodo),
    };
  });
}
