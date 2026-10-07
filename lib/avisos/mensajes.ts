// Texto de cada aviso automático. El diseño (logo, color, pie) lo pone la plantilla de React
// Email (components/emails/notificacion-crm.tsx), que ya saluda al cliente por su nombre.

import type { TipoAviso } from "@/lib/avisos/reglas";
import { formatFecha, formatMoneda, hoyISO } from "@/lib/format";
import { sumarDias } from "@/lib/polizas/gracia";

export type DatosAviso = {
  cliente: string;
  poliza: string;
  aseguradora: string;
  /** Vencimiento del recibo o fin de vigencia de la póliza (YYYY-MM-DD). */
  fecha: string;
  /** Solo avisos de recibo. */
  monto?: number;
  numeroRecibo?: number;
  diasGracia?: number;
  /** Buzón de la agencia al que el cliente debe escribir (su correo de copia). */
  correoContacto?: string;
  /** Fecha del envío (YYYY-MM-DD), para hablar en pasado o en futuro del vencimiento. Hoy si no viene. */
  hoy?: string;
};

/** Cierre del aviso: remite al buzón de la agencia (su correo de copia), no al remitente automático. */
const despedida = (correo: string | undefined) => [
  correo
    ? `Si tienes cualquier duda responde al siguiente correo ${correo} y con gusto te atenderán.`
    : "Si tienes cualquier duda, contáctanos y con gusto te atenderemos.",
  "Saludos cordiales.",
];
const YA_PAGASTE = "Si ya realizaste el pago, haz caso omiso de este mensaje.";

/** Asunto, título y mensaje en texto plano (un párrafo por línea). */
export function mensajeAviso(tipo: TipoAviso, d: DatosAviso): { asunto: string; titulo: string; mensaje: string } {
  const fecha = formatFecha(d.fecha);
  const DESPEDIDA = despedida(d.correoContacto);
  const recibo =
    `el recibo ${d.numeroRecibo ?? ""} de tu póliza ${d.poliza} con ${d.aseguradora}` +
    (d.monto === undefined ? "" : `, por ${formatMoneda(d.monto)},`);

  if (tipo === "por_vencer") {
    return {
      asunto: `Próximo recibo a pagar de tu póliza ${d.poliza}: vence el ${fecha}`,
      titulo: "Próximo recibo a pagar",
      mensaje: [
        `Te recordamos que tu próximo recibo a pagar es ${recibo.replace(/,$/, "")} y vence el ${fecha}.`,
        "Pagarlo a tiempo mantiene tu cobertura sin interrupciones.",
        YA_PAGASTE,
        ...DESPEDIDA,
      ].join("\n"),
    };
  }
  if (tipo === "vencido") {
    // Segundo aviso de cobro: sale unos días después del primero, antes o después del vencimiento.
    const hoy = d.hoy ?? hoyISO();
    const gracia = d.diasGracia ?? 0;
    const limite = sumarDias(d.fecha, gracia);
    const vencido = d.fecha < hoy;
    return {
      asunto: vencido
        ? `Segundo aviso: recibo vencido de tu póliza ${d.poliza}`
        : `Segundo aviso: tu recibo de la póliza ${d.poliza} vence el ${fecha}`,
      titulo: "Tu recibo sigue pendiente de pago",
      mensaje: [
        vencido
          ? `Te informamos que ${recibo} venció el ${fecha} y aún no tenemos registrado su pago.`
          : `Te recordamos que ${recibo} vence el ${fecha} y aún no tenemos registrado su pago.`,
        !vencido
          ? "Pagarlo a tiempo mantiene tu cobertura sin interrupciones."
          : gracia > 0 && limite >= hoy
            ? `Todavía puedes pagarlo hasta el ${formatFecha(limite)} para conservar tu cobertura.`
            : "Para evitar la cancelación de tu póliza, te pedimos realizar el pago a la brevedad.",
        YA_PAGASTE,
        ...DESPEDIDA,
      ].join("\n"),
    };
  }
  return {
    asunto: `Tu póliza ${d.poliza} está por terminar su vigencia`,
    titulo: "Tu póliza está por renovarse",
    mensaje: [
      `La vigencia de tu póliza ${d.poliza} con ${d.aseguradora} termina el ${fecha}.`,
      "Para que no te quedes sin cobertura, nos pondremos en contacto contigo para preparar tu renovación.",
      ...DESPEDIDA,
    ].join("\n"),
  };
}

/**
 * Agradecimiento al capturar la renovación de una póliza: le confirma al cliente el número y la
 * vigencia nuevos y lo invita a escribir al correo de servicio de la agencia.
 */
export function mensajeAgradecimientoRenovacion(d: {
  agencia: string;
  poliza: string;
  /** Ramo legible ("Gastos Médicos Mayores"). */
  ramo?: string;
  aseguradora: string;
  /** Vigencia nueva (YYYY-MM-DD). */
  inicio: string;
  fin: string;
  correoServicio?: string;
}): { asunto: string; titulo: string; mensaje: string } {
  return {
    asunto: `Gracias por continuar con nosotros: tu póliza ${d.poliza} ya está renovada`,
    titulo: "¡Gracias por continuar con nosotros!",
    mensaje: [
      `Tu póliza${d.ramo ? ` de ${d.ramo}` : ""} con ${d.aseguradora} ya quedó renovada. Te agradecemos la confianza de seguir con ${d.agencia}: es un gusto seguir protegiéndote.`,
      `Póliza ${d.poliza}, vigente del ${formatFecha(d.inicio)} al ${formatFecha(d.fin)}.`,
      d.correoServicio
        ? `Si tienes cualquier duda o necesitas algo, escríbenos a ${d.correoServicio} y con gusto te atenderemos.`
        : "Si tienes cualquier duda o necesitas algo, responde a este correo y con gusto te atenderemos.",
      "Saludos cordiales.",
    ].join("\n"),
  };
}
