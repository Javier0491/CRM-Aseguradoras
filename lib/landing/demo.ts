// Solicitud de Demo VIP desde la landing pública: opciones, lectura y validación del formulario.
// Se usa en el servidor (Server Action) y en el cliente (opciones del formulario): nada de servidor.

import { esEdicion, ETIQUETA_EDICION, PLANES } from "@/lib/planes/planes";

export const PLANES_DEMO = [
  { valor: "agente", etiqueta: PLANES.AGENTE.nombre },
  { valor: "broker", etiqueta: PLANES.BROKER.nombre },
  { valor: "indeciso", etiqueta: "Aún no lo sé" },
] as const;
export type PlanDemo = (typeof PLANES_DEMO)[number]["valor"];

export const MAX_DEMO = { nombre: 120, correo: 160, correduria: 160, telefono: 30, mensaje: 1200 } as const;

/** Campo trampa: invisible para las personas; si llega lleno, lo llenó un bot. */
export const CAMPO_TRAMPA = "sitio_web";

export type SolicitudDemo = {
  nombre: string;
  correo: string;
  correduria: string;
  telefono: string;
  plan: string;
  /** BASICO o PRO, o vacío: viene de la tarjeta de precios. */
  edicion: string;
  mensaje: string;
};
export type CampoDemo = keyof SolicitudDemo;
export type ErroresDemo = Partial<Record<CampoDemo, string>>;

const EMAIL_VALIDO = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
const TELEFONO_VALIDO = /^[+\d][\d\s().-]{6,}$/;

/** Una sola línea: sin saltos ni espacios repetidos (van al asunto y al cuerpo del correo). */
const enUnaLinea = (valor: string) => valor.replace(/\s+/g, " ").trim();

export function leerSolicitudDemo(formData: FormData): { datos: SolicitudDemo; esBot: boolean } {
  const texto = (campo: string) => String(formData.get(campo) ?? "");
  return {
    datos: {
      nombre: enUnaLinea(texto("nombre")),
      correo: enUnaLinea(texto("correo")).toLowerCase(),
      correduria: enUnaLinea(texto("correduria")),
      telefono: enUnaLinea(texto("telefono")),
      plan: texto("plan").trim(),
      edicion: texto("edicion").trim(),
      mensaje: texto("mensaje").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    },
    esBot: texto(CAMPO_TRAMPA).trim() !== "",
  };
}

export function validarSolicitudDemo(datos: SolicitudDemo): ErroresDemo {
  const errores: ErroresDemo = {};
  if (datos.nombre.length < 2) errores.nombre = "Escribe tu nombre.";
  else if (datos.nombre.length > MAX_DEMO.nombre) errores.nombre = `Máximo ${MAX_DEMO.nombre} caracteres.`;

  if (!datos.correo) errores.correo = "Escribe tu correo de trabajo.";
  else if (datos.correo.length > MAX_DEMO.correo || !EMAIL_VALIDO.test(datos.correo)) errores.correo = "Revisa el correo.";

  if (datos.correduria.length < 2) errores.correduria = "Escribe el nombre de tu correduría o agencia.";
  else if (datos.correduria.length > MAX_DEMO.correduria) errores.correduria = `Máximo ${MAX_DEMO.correduria} caracteres.`;

  if (datos.telefono && (datos.telefono.length > MAX_DEMO.telefono || !TELEFONO_VALIDO.test(datos.telefono))) {
    errores.telefono = "Revisa el teléfono.";
  }
  if (!PLANES_DEMO.some((p) => p.valor === datos.plan)) errores.plan = "Elige un plan.";
  if (datos.mensaje.length > MAX_DEMO.mensaje) errores.mensaje = `Máximo ${MAX_DEMO.mensaje} caracteres.`;
  return errores;
}

const etiqueta = (opciones: readonly { valor: string; etiqueta: string }[], valor: string) =>
  opciones.find((o) => o.valor === valor)?.etiqueta ?? valor;

/** Asunto y cuerpo (texto plano, un párrafo por línea) del aviso que recibe el equipo comercial. */
export function correoSolicitudDemo(datos: SolicitudDemo) {
  return {
    asunto: `Demo VIP · ${datos.correduria}`.slice(0, 200),
    lineas: [
      `${datos.nombre} pidió una Demo VIP de ZenSecure desde la landing.`,
      `Correduría: ${datos.correduria}`,
      `Correo: ${datos.correo}`,
      `Teléfono: ${datos.telefono || "—"}`,
      `Plan de interés: ${etiqueta(PLANES_DEMO, datos.plan)}${
        datos.plan !== "indeciso" && esEdicion(datos.edicion) ? ` ${ETIQUETA_EDICION[datos.edicion]}` : ""
      }`,
      ...(datos.mensaje ? [`Mensaje: ${datos.mensaje}`] : []),
      "Responde a este correo para escribirle directamente.",
    ],
  };
}
