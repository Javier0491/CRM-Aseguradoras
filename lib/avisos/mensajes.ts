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

/** Datos de los correos al cliente que le entregan su póliza (renovada o nueva). */
export type DatosEntregaPoliza = {
  agencia: string;
  poliza: string;
  /** Ramo legible ("Gastos Médicos Mayores"). */
  ramo?: string;
  aseguradora: string;
  /** Vigencia (YYYY-MM-DD). */
  inicio: string;
  fin: string;
  correoServicio?: string;
  /** Lo que va adjunto ("la carátula", "el expediente completo") y lo que va como enlace. */
  documentos?: { adjuntos: string[]; enlaces: { que: string; url: string }[] };
  /** Solo el aviso de endoso: el movimiento que se aplicó, si está registrado. */
  endoso?: { tipo: string; numero: string | null; fecha: string; descripcion: string };
};

/** Vigencia, documentos y despedida: lo que comparten los correos que entregan la póliza. */
function cuerpoEntregaPoliza(d: DatosEntregaPoliza): string[] {
  const unir = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : (xs[0] ?? ""));
  const adjuntos = d.documentos?.adjuntos ?? [];
  const enlaces = d.documentos?.enlaces ?? [];
  return [
    `Póliza ${d.poliza}, vigente del ${formatFecha(d.inicio)} al ${formatFecha(d.fin)}.`,
    ...(adjuntos.length > 0 ? [`Te adjuntamos ${unir(adjuntos)} de tu póliza para que los descargues y los tengas a la mano.`] : []),
    ...enlaces.map((e) => `Descarga ${e.que} de tu póliza aquí (el enlace está disponible 7 días): ${e.url}`),
    d.correoServicio
      ? `Si tienes cualquier duda o necesitas algo, escríbenos a ${d.correoServicio} y con gusto te atenderemos.`
      : "Si tienes cualquier duda o necesitas algo, responde a este correo y con gusto te atenderemos.",
    "Saludos cordiales.",
  ];
}

/**
 * Agradecimiento al capturar la renovación de una póliza: le confirma al cliente el número y la
 * vigencia nuevos y lo invita a escribir al correo de servicio de la agencia.
 */
export function mensajeAgradecimientoRenovacion(d: DatosEntregaPoliza): { asunto: string; titulo: string; mensaje: string } {
  return {
    asunto: `Gracias por continuar con nosotros: tu póliza ${d.poliza} ya está renovada`,
    titulo: "¡Gracias por continuar con nosotros!",
    mensaje: [
      `Tu póliza${d.ramo ? ` de ${d.ramo}` : ""} con ${d.aseguradora} ya quedó renovada. Te agradecemos la confianza de seguir con ${d.agencia}: es un gusto seguir protegiéndote.`,
      ...cuerpoEntregaPoliza(d),
    ].join("\n"),
  };
}

/**
 * Entrega de una póliza nueva (no renovación): le avisa al cliente que su póliza ya está lista,
 * con el número, la vigencia y sus documentos.
 */
export function mensajePolizaNueva(d: DatosEntregaPoliza): { asunto: string; titulo: string; mensaje: string } {
  return {
    asunto: `Tu nueva póliza ${d.poliza} ya está lista`,
    titulo: "¡Tu nueva póliza ya está lista!",
    mensaje: [
      `Tu nueva póliza${d.ramo ? ` de ${d.ramo}` : ""} con ${d.aseguradora} ya está lista. Gracias por confiar en ${d.agencia}: es un gusto protegerte.`,
      ...cuerpoEntregaPoliza(d),
    ].join("\n"),
  };
}

/**
 * Aviso de endoso: le confirma al cliente que se aplicaron los cambios a su póliza y le entrega la
 * versión actualizada (carátula y expediente). `endoso.tipo` ya viene como etiqueta legible.
 */
export function mensajeEndoso(d: DatosEntregaPoliza): { asunto: string; titulo: string; mensaje: string } {
  const e = d.endoso;
  return {
    asunto: `Se realizaron los cambios a tu póliza ${d.poliza}`,
    titulo: "Se realizaron los cambios a tu póliza",
    mensaje: [
      `Te informamos que se realizaron los cambios correspondientes a tu póliza${d.ramo ? ` de ${d.ramo}` : ""} con ${d.aseguradora}.`,
      ...(e
        ? [
            `Movimiento aplicado: ${e.tipo}${e.numero ? ` (endoso ${e.numero})` : ""}, con efecto a partir del ${formatFecha(e.fecha)}.${e.descripcion.trim() ? ` ${e.descripcion.trim()}` : ""}`,
          ]
        : []),
      "Te compartimos tu póliza actualizada con los cambios ya aplicados. Te recomendamos conservarla y sustituir la versión anterior.",
      ...cuerpoEntregaPoliza(d),
    ].join("\n"),
  };
}
