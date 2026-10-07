// Matriz de avisos automáticos por aseguradora (compartida por el formulario, la Server Action
// y el envío programado).

import { sumarDias } from "@/lib/polizas/gracia";

export const TIPOS_AVISO = [
  {
    clave: "por_vencer",
    campo: "avisoDiasAntes",
    titulo: "Próximo recibo a pagar",
    ayuda: "Días antes del vencimiento",
  },
  {
    // La clave y la columna conservan su nombre original para que los avisos ya enviados cuenten.
    clave: "vencido",
    campo: "avisoDiasVencido",
    titulo: "Segundo aviso de cobro",
    ayuda: "Días después del primer aviso, si sigue sin pagarse",
  },
  {
    clave: "renovacion",
    campo: "avisoDiasRenovacion",
    titulo: "Renovación próxima",
    ayuda: "Días antes del fin de vigencia",
  },
] as const;

export type TipoAviso = (typeof TIPOS_AVISO)[number]["clave"];
export type CampoAviso = (typeof TIPOS_AVISO)[number]["campo"];
/** Días de cada aviso de una aseguradora; null = ese aviso no se envía. */
export type DiasAviso = Record<CampoAviso, number | null>;

export const MIN_DIAS_AVISO = 1;
export const MAX_DIAS_AVISO = 90;

export const diasAvisoValidos = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= MIN_DIAS_AVISO && v <= MAX_DIAS_AVISO);

/**
 * Un segundo aviso solo sale durante esta ventana después de cumplir sus días: si la tarea diaria
 * no corrió o el cliente no tenía correo, no se reclaman recibos de hace meses.
 */
export const VENTANA_SEGUNDO_AVISO = 7;

/**
 * Qué aviso le toca hoy a un recibo PENDIENTE (los pagados y conciliados no reciben ninguno):
 * - por_vencer ("Próximo recibo a pagar"): de `diasAntes` días antes del vencimiento hasta ese día.
 * - vencido (segundo aviso de cobro): `diasSegundo` días después del primer aviso, si sigue sin
 *   pagarse. Si el primero no salió (aviso apagado, cliente sin correo, recibo capturado tarde),
 *   se cuenta desde el vencimiento.
 * Fechas YYYY-MM-DD; `primerAviso`, el día en que salió el primero. Cada aviso sale una sola vez:
 * los ya enviados los descarta quien llama.
 */
export function avisoDeRecibo(r: {
  vencimiento: string;
  hoy: string;
  primerAviso: string | null;
  diasAntes: number | null;
  diasSegundo: number | null;
}): "por_vencer" | "vencido" | null {
  const { vencimiento, hoy, primerAviso, diasAntes, diasSegundo } = r;
  if (!primerAviso && diasAntes !== null && vencimiento >= hoy && vencimiento <= sumarDias(hoy, diasAntes)) {
    return "por_vencer";
  }
  if (diasSegundo === null) return null;
  const desde = sumarDias(primerAviso ?? vencimiento, diasSegundo);
  return hoy >= desde && hoy <= sumarDias(desde, VENTANA_SEGUNDO_AVISO) ? "vencido" : null;
}
