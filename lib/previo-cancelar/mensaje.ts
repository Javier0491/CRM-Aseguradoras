// Texto del aviso "previo a cancelar" que recibe el cliente. Lo usan el envío (servidor) y la vista
// previa (navegador), así que no importa nada de servidor. La plantilla del correo ya saluda al
// cliente por su nombre ("Hola, NOMBRE:").
import { ramoLabel } from "@/components/polizas/poliza-ui";
import type { Ramo } from "@/lib/generated/prisma/client";

export const TIPO_AVISO_PREVIO = "previo_cancelar";

/** Máximo de pólizas por archivo y por envío (el navegador manda los envíos en tandas). */
export const MAX_POLIZAS_PREVIO = 2000;
export const TANDA_ENVIO_PREVIO = 10;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const fechaIsoValida = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** "2026-11-19" → "19 de noviembre del 2026". */
export function fechaLarga(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} del ${a}`;
}

/** "2026-11-19" → "NOVIEMBRE". */
export const mesDe = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1].toUpperCase();

/** Mes del aviso: con él se evita mandar dos veces el aviso de la misma póliza en el mismo mes. */
export const periodoPrevio = (fechaVentanilla: string) => fechaVentanilla.slice(0, 7);

/** Clave del aviso en avisos_enviados: una vez por póliza y mes. */
export const referenciaPrevio = (polizaId: string, fechaVentanilla: string) =>
  `${polizaId}:${periodoPrevio(fechaVentanilla)}`;

/** Fechas límite que se proponen: el 19 (ventanilla) y el 20 (portal) del mes en curso. */
export function fechasPropuestas(hoy: string) {
  const mes = hoy.slice(0, 7);
  return { ventanilla: `${mes}-19`, portal: `${mes}-20` };
}

/** Cómo se nombra el ramo en el aviso: "GASTOS MÉDICOS", "VIDA", "AUTOS"… */
export function ramoAviso(ramo: Ramo | null): string {
  if (!ramo) return "SEGURO";
  if (ramo.startsWith("GMM")) return "GASTOS MÉDICOS";
  if (ramo.startsWith("VIDA")) return "VIDA";
  return ramoLabel[ramo].toUpperCase();
}

export type DatosPrevio = {
  /** Ramo ya como va en el aviso (ver ramoAviso). */
  ramo: string;
  poliza: string;
  aseguradora: string;
  /** YYYY-MM-DD */
  fechaVentanilla: string;
  /** YYYY-MM-DD */
  fechaPortal: string;
  /** Referencia bancaria para pagar en ventanilla, si el archivo la trae. */
  referencia?: string;
  /** Buzón de la agencia al que el cliente debe escribir. */
  correoContacto?: string;
};

/** Asunto, título y mensaje en texto plano (un párrafo por línea). */
export function mensajePrevioCancelar(d: DatosPrevio): { asunto: string; titulo: string; mensaje: string } {
  return {
    asunto: `Aviso importante: tu póliza ${d.poliza} está previa a cancelar`,
    titulo: "Tu póliza está previa a cancelar",
    mensaje: [
      "Buen día.",
      `Esta póliza de ${d.ramo} (número ${d.poliza}) está previa a cancelar en el mes de ${mesDe(d.fechaVentanilla)}, para evitar su cancelación debe de pagarse máximo el día ${fechaLarga(d.fechaVentanilla)} en ventanilla bancaria o el ${fechaLarga(d.fechaPortal)} en portal de ${d.aseguradora}.`,
      ...(d.referencia ? [`Referencia bancaria para pagar en ventanilla: ${d.referencia}`] : []),
      "Favor de validar su aplicación en sistemas, en caso de estar aplicado el pago recordemos que no corre riesgo de cancelación.",
      d.correoContacto
        ? `Si tienes cualquier duda responde al siguiente correo ${d.correoContacto} y con gusto te atenderán.`
        : "Si tienes cualquier duda, contáctanos y con gusto te atenderemos.",
      "Saludos cordiales.",
    ].join("\n"),
  };
}
