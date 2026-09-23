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
 * Reparte la prima total en recibos según la forma de pago.
 * Cada recibo vence al inicio de su periodo. Los centavos sobrantes del
 * reparto se asignan al primer recibo para que la suma sea exacta.
 */
export function generarRecibos({
  vigenciaInicio,
  vigenciaFin,
  primaTotal,
  mesesPorPeriodo,
}: {
  vigenciaInicio: string;
  vigenciaFin: string;
  primaTotal: number;
  mesesPorPeriodo: number;
}): ReciboGenerado[] {
  const periodos = Math.max(1, Math.ceil(mesesEntre(vigenciaInicio, vigenciaFin) / mesesPorPeriodo));
  const centavos = Math.round(primaTotal * 100);
  const base = Math.floor(centavos / periodos);
  const residuo = centavos - base * periodos;

  return Array.from({ length: periodos }, (_, i) => {
    const monto = base + (i === 0 ? residuo : 0);
    return {
      numero: i + 1,
      monto: (monto / 100).toFixed(2),
      fechaVencimiento: sumarMeses(vigenciaInicio, i * mesesPorPeriodo),
    };
  });
}
