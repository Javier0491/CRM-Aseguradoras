// Texto de cada aviso automático. El diseño (logo, color, pie) lo pone la plantilla de React
// Email (components/emails/notificacion-crm.tsx), que ya saluda al cliente por su nombre.

import type { TipoAviso } from "@/lib/avisos/reglas";
import { formatFecha, formatMoneda } from "@/lib/format";
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
      asunto: `Tu recibo de la póliza ${d.poliza} vence el ${fecha}`,
      titulo: "Tu recibo está por vencer",
      mensaje: [`Te recordamos que ${recibo} vence el ${fecha}.`, YA_PAGASTE, ...DESPEDIDA].join("\n"),
    };
  }
  if (tipo === "vencido") {
    const gracia = d.diasGracia ?? 0;
    return {
      asunto: `Recibo vencido de tu póliza ${d.poliza}`,
      titulo: "Tienes un recibo vencido",
      mensaje: [
        `Te informamos que ${recibo} venció el ${fecha} y aún no tenemos registrado su pago.`,
        gracia > 0
          ? `Todavía puedes pagarlo hasta el ${formatFecha(sumarDias(d.fecha, gracia))} para conservar tu cobertura.`
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
