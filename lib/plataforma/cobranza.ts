// Cobranza de la plataforma a cada agencia: estado del pago, siguiente periodo y qué hace la
// tarea diaria (funciones puras; fechas YYYY-MM-DD).
import { formatFecha } from "@/lib/format";
import { sumarMeses } from "@/lib/polizas/recibos";

/** Días antes de que venza el periodo pagado en que se avisa a la agencia. */
export const DIAS_AVISO_COBRO = 5;
export const MAX_DIAS_TOLERANCIA = 60;
export const MAX_MESES_PAGO = 24;

const DIA_MS = 86_400_000;
export const sumarDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

/**
 * - sin_configurar: no tiene cuota o no se ha registrado hasta cuándo está pagada.
 * - al_corriente: faltan más de DIAS_AVISO_COBRO días para que venza lo pagado.
 * - por_vencer: vence en DIAS_AVISO_COBRO días o menos (incluido el mismo día).
 * - vencida: ya venció, pero sigue dentro de los días de tolerancia.
 * - suspendible: venció y pasó la tolerancia (la suspensión automática la aplica).
 */
export type EstadoCobro = "sin_configurar" | "al_corriente" | "por_vencer" | "vencida" | "suspendible";

export type CobroAgencia = {
  cuotaMensual: number | null;
  /** Último día cubierto por los pagos. */
  pagadoHasta: string | null;
  diasTolerancia: number;
};

/**
 * Estado del pago de una agencia al día `hoy`. `dias` son los que faltan para que venza lo pagado
 * (negativo si ya venció) y `limite`, el último día antes de poder suspenderla.
 */
export function estadoCobro(a: CobroAgencia, hoy: string): { estado: EstadoCobro; dias: number | null; limite: string | null } {
  if (a.cuotaMensual === null || !a.pagadoHasta) return { estado: "sin_configurar", dias: null, limite: null };
  const dias = diasEntre(hoy, a.pagadoHasta);
  const limite = sumarDias(a.pagadoHasta, a.diasTolerancia);
  let estado: EstadoCobro;
  if (dias > DIAS_AVISO_COBRO) estado = "al_corriente";
  else if (dias >= 0) estado = "por_vencer";
  else if (hoy <= limite) estado = "vencida";
  else estado = "suspendible";
  return { estado, dias, limite };
}

/**
 * Nuevo "pagado hasta" al registrar un pago de `meses`: se suma a lo ya pagado (aunque esté
 * vencido, el periodo no se recorre). Sin fecha previa, cuenta desde hoy: el último día cubierto
 * es la víspera del mismo día del mes siguiente.
 */
export function siguientePagadoHasta(pagadoHasta: string | null, hoy: string, meses: number): string {
  if (pagadoHasta) return sumarMeses(pagadoHasta, meses);
  return sumarDias(sumarMeses(hoy, meses), -1);
}

export type AccionCobro = "avisar" | "suspender" | null;

/**
 * Lo que hace la tarea diaria con una agencia: avisar una vez por periodo cuando está por vencer o
 * vencida (si no se avisó ya para ese pagadoHasta) y suspenderla al pasar la tolerancia si tiene
 * la suspensión automática. Una agencia suspendida no recibe más avisos.
 */
export function accionCobroDiaria(
  a: CobroAgencia & { suspendida: boolean; suspensionAutomatica: boolean; avisoCobroEnviadoPara: string | null },
  hoy: string
): AccionCobro {
  if (a.suspendida) return null;
  const { estado } = estadoCobro(a, hoy);
  if (estado === "suspendible") return a.suspensionAutomatica ? "suspender" : a.avisoCobroEnviadoPara === a.pagadoHasta ? null : "avisar";
  if ((estado === "por_vencer" || estado === "vencida") && a.avisoCobroEnviadoPara !== a.pagadoHasta) return "avisar";
  return null;
}

export const ETIQUETA_ESTADO_COBRO: Record<EstadoCobro, string> = {
  sin_configurar: "Sin cobranza",
  al_corriente: "Al corriente",
  por_vencer: "Por vencer",
  vencida: "Pago vencido",
  suspendible: "Fuera de tolerancia",
};

/**
 * Detalle del estado de pago: cuántos días faltan o hace cuánto venció. Vive aquí (no en el
 * componente de la tabla, que es de cliente) porque también lo usa el servidor en el lobby.
 */
export function detalleCobro(a: { estado: EstadoCobro; dias: number | null; limite: string | null }) {
  if (a.dias === null) return "Sin cuota configurada";
  if (a.dias > 0) return `Vence en ${a.dias} ${a.dias === 1 ? "día" : "días"}`;
  if (a.dias === 0) return "Vence hoy";
  return a.estado === "vencida" && a.limite
    ? `Venció hace ${-a.dias} d · tolerancia al ${formatFecha(`${a.limite}T00:00:00Z`)}`
    : `Venció hace ${-a.dias} d`;
}
