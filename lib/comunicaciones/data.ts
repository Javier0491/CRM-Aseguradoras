// Datos de ejemplo para el gestor de avisos de cobranza.
import type { Plantilla, ReciboCobranza } from "@/lib/comunicaciones/plantillas";

/** Fecha de corte fija para que el cálculo de días sea determinista en servidor y cliente. */
export const FECHA_CORTE = "2026-09-22";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Días entre la fecha de corte y el vencimiento (negativo = vencido). */
export function diasParaVencer(fechaVencimiento: string, corte = FECHA_CORTE) {
  return Math.round((Date.parse(fechaVencimiento) - Date.parse(corte)) / DIA_MS);
}

export const recibosPorCobrar: ReciboCobranza[] = [
  { folio: "REC-24-009102", poliza: "GNP-GM-1033871", cliente: "Patricia Elena Villarreal", email: "pvillarreal@correo.mx", aseguradora: "GNP", monto: 18_450.0, fechaVencimiento: "2026-09-08" },
  { folio: "REC-24-009087", poliza: "QUA-AU-7712093", cliente: "Logística Express del Norte", email: "pagos@logexnorte.mx", aseguradora: "Quálitas", monto: 96_310.5, fechaVencimiento: "2026-09-15" },
  { folio: "REC-24-009095", poliza: "MET-VI-5524410", cliente: "Jorge Iván Castañeda", email: "jcastaneda@correo.mx", aseguradora: "MetLife", monto: 4_820.0, fechaVencimiento: "2026-09-19" },
  { folio: "REC-24-009110", poliza: "AXA-DA-3305512", cliente: "Comercializadora Alfa Bajío", email: "tesoreria@alfabajio.mx", aseguradora: "AXA", monto: 152_900.0, fechaVencimiento: "2026-09-24" },
  { folio: "REC-24-009118", poliza: "GNP-VI-2290017", cliente: "Daniela Ruiz Esparza", email: "druiz@correo.mx", aseguradora: "GNP", monto: 7_615.2, fechaVencimiento: "2026-09-27" },
  { folio: "REC-24-009121", poliza: "MAP-HG-4475510", cliente: "Fernando Olvera Paz", email: "folvera@correo.mx", aseguradora: "Mapfre", monto: 3_240.0, fechaVencimiento: "2026-09-30" },
  { folio: "REC-24-009126", poliza: "MET-GM-6614480", cliente: "Consultores Asociados MX", email: "rh@consultoresmx.mx", aseguradora: "MetLife", monto: 131_926.9, fechaVencimiento: "2026-10-03" },
];

export const plantillasIniciales: Plantilla[] = [
  {
    id: "recordatorio",
    nombre: "Recordatorio preventivo",
    asunto: "Recordatorio: tu póliza {{numero_poliza}} vence el {{fecha_vencimiento}}",
    cuerpo: `Estimado(a) {{nombre_cliente}}:

Te recordamos que el recibo de tu póliza {{numero_poliza}} con {{aseguradora}} por {{monto_adeudo}} vence el {{fecha_vencimiento}}.

Realizar tu pago a tiempo mantiene tu cobertura vigente sin interrupciones. Si ya lo realizaste, por favor ignora este mensaje.

Atentamente,
Equipo de Cobranza · PJ MAGNUS`,
  },
  {
    id: "vencido",
    nombre: "Aviso de recibo vencido",
    asunto: "Aviso importante: recibo vencido de la póliza {{numero_poliza}}",
    cuerpo: `Estimado(a) {{nombre_cliente}}:

Nuestros registros indican que el recibo de tu póliza {{numero_poliza}} con {{aseguradora}}, por un monto de {{monto_adeudo}}, venció el {{fecha_vencimiento}}.

Para evitar la cancelación de tu cobertura, te pedimos regularizar el pago a la brevedad. Estamos a tus órdenes para cualquier aclaración.

Atentamente,
Equipo de Cobranza · PJ MAGNUS`,
  },
  {
    id: "ultimo",
    nombre: "Último aviso antes de cancelación",
    asunto: "Último aviso: {{numero_poliza}} en riesgo de cancelación",
    cuerpo: `Estimado(a) {{nombre_cliente}}:

A la fecha no hemos recibido el pago de {{monto_adeudo}} correspondiente a tu póliza {{numero_poliza}} ({{aseguradora}}), vencido desde el {{fecha_vencimiento}}.

Si el pago no se registra en los próximos días, la aseguradora podrá cancelar la póliza. Contáctanos hoy mismo para ayudarte.

Atentamente,
Equipo de Cobranza · PJ MAGNUS`,
  },
];
