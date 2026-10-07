import "server-only";

import { createHash } from "node:crypto";

import { Resend, type Attachment } from "resend";

import {
  construirCorreoHtml,
  htmlATexto,
  MAX_BYTES_IMAGEN,
  personalizar,
  remitenteDeAgencia,
  TIPOS_IMAGEN,
  type DestinatarioCorreo,
  type MarcaCorreo,
  type ResultadoEnvio,
} from "@/lib/comunicaciones/correo";

export class CorreoNoConfiguradoError extends Error {
  constructor(faltante: string) {
    super(`El envío de correos no está configurado (falta ${faltante}).`);
    this.name = "CorreoNoConfiguradoError";
  }
}

export class ImagenInvalidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ImagenInvalidaError";
  }
}

let cliente: Resend | undefined;

/** Configuración de Resend leída de RESEND_API_KEY, EMAIL_SENDER y EMAIL_REPLY_TO (opcional). */
export function getConfigCorreo() {
  const apiKey = process.env.RESEND_API_KEY;
  const remitente = process.env.EMAIL_SENDER?.trim();
  if (!apiKey) throw new CorreoNoConfiguradoError("RESEND_API_KEY");
  if (!remitente) throw new CorreoNoConfiguradoError("EMAIL_SENDER");
  cliente ??= new Resend(apiKey);
  return {
    resend: cliente,
    remitente,
    responderA: process.env.EMAIL_REPLY_TO?.trim() || undefined,
  };
}

const EMAIL_VALIDO = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

export function emailValido(email: string) {
  return EMAIL_VALIDO.test(email.trim());
}

const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

/**
 * Convierte las imágenes insertadas como `data:` URI en adjuntos en línea (`cid:`).
 * Gmail y Outlook bloquean las imágenes en base64 dentro del HTML, pero muestran las
 * referenciadas por Content-ID.
 */
export function extraerImagenesEnLinea(html: string) {
  const adjuntos = new Map<string, Attachment>();
  const resultado = html.replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(["'])data:([^;,]+);base64,([^"']+)\2/gi,
    (_m, prefijo: string, comilla: string, tipo: string, base64: string) => {
      const mime = tipo.toLowerCase();
      if (!(TIPOS_IMAGEN as readonly string[]).includes(mime)) {
        throw new ImagenInvalidaError("Solo se admiten imágenes PNG, JPG o GIF en el cuerpo del correo.");
      }
      const contenido = Buffer.from(base64, "base64");
      if (contenido.length > MAX_BYTES_IMAGEN) {
        throw new ImagenInvalidaError("Cada imagen del correo debe pesar como máximo 2 MB.");
      }
      // La misma imagen repetida se adjunta una sola vez.
      const cid = `img-${createHash("sha256").update(contenido).digest("hex").slice(0, 16)}`;
      if (!adjuntos.has(cid)) {
        adjuntos.set(cid, {
          content: contenido,
          filename: `${cid}.${EXTENSION[mime]}`,
          contentType: mime,
          contentId: cid,
        });
      }
      return `${prefijo}${comilla}cid:${cid}${comilla}`;
    }
  );
  return { html: resultado, adjuntos: [...adjuntos.values()] };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Pausa entre correos para no rebasar el límite de Resend (2 solicitudes/s por omisión). */
const PAUSA_MS = 550;

/** Envía con un reintento si Resend responde 429 (límite de velocidad). */
async function despachar(resend: Resend, correo: Parameters<Resend["emails"]["send"]>[0]) {
  let { error } = await resend.emails.send(correo);
  if (error?.statusCode === 429) {
    await esperar(1500);
    ({ error } = await resend.emails.send(correo));
  }
  return error;
}

/**
 * Envía un correo individual a cada destinatario (nadie ve las direcciones de los demás).
 * El cuerpo admite {{nombre}}, que se sustituye por el nombre de cada cliente.
 * Sale de la dirección universal (EMAIL_SENDER) con el nombre y la marca de la agencia.
 */
export async function enviarCorreos({
  asunto,
  html,
  destinatarios,
  marca,
}: {
  asunto: string;
  html: string;
  destinatarios: DestinatarioCorreo[];
  marca: MarcaCorreo;
}): Promise<ResultadoEnvio[]> {
  const { resend, remitente, responderA } = getConfigCorreo();
  const de = remitenteDeAgencia(remitente, marca.nombre);
  // Las respuestas de los clientes llegan al correo de servicio de la agencia.
  const responder = marca.correoServicio?.trim() || responderA;
  const { html: cuerpo, adjuntos } = extraerImagenesEnLinea(html);
  const resultados: ResultadoEnvio[] = [];

  for (const [i, d] of destinatarios.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    const asuntoFinal = personalizar(asunto, d.nombre, false);
    const htmlFinal = construirCorreoHtml({ asunto: asuntoFinal, cuerpo: personalizar(cuerpo, d.nombre, true), marca });
    const error = await despachar(resend, {
      from: de,
      to: d.email,
      replyTo: responder,
      subject: asuntoFinal,
      html: htmlFinal,
      text: htmlATexto(htmlFinal),
      attachments: adjuntos.length > 0 ? adjuntos : undefined,
      tags: [{ name: "modulo", value: "comunicaciones" }],
    });
    if (error && (error.statusCode === 401 || error.statusCode === 403) && i === 0) {
      // Llave inválida o dominio no verificado: no tiene caso intentar con el resto.
      throw new CorreoNoConfiguradoError(`una configuración válida de Resend: ${error.message}`);
    }
    resultados.push({ email: d.email, nombre: d.nombre, ok: !error, error: error?.message });
  }
  return resultados;
}

/**
 * Correo de la plataforma a una agencia (cobro del servicio, suspensión, prueba de diagnóstico).
 * Sale de EMAIL_SENDER tal cual, con el nombre de la plataforma, a cada destinatario por separado.
 */
export async function enviarCorreoPlataforma({
  para,
  asunto,
  html,
  texto,
}: {
  para: string[];
  asunto: string;
  html: string;
  texto: string;
}): Promise<{ enviados: number; errores: string[] }> {
  const { resend, remitente, responderA } = getConfigCorreo();
  let enviados = 0;
  const errores: string[] = [];
  for (const [i, destinatario] of para.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    const error = await despachar(resend, {
      from: remitente,
      to: destinatario,
      replyTo: responderA,
      subject: asunto,
      html,
      text: texto,
      tags: [{ name: "modulo", value: "plataforma" }],
    });
    if (error && (error.statusCode === 401 || error.statusCode === 403)) {
      throw new CorreoNoConfiguradoError(`una configuración válida de Resend: ${error.message}`);
    }
    if (error) errores.push(`${destinatario}: ${error.message}`);
    else enviados++;
  }
  return { enviados, errores };
}

/**
 * Envía un aviso automático ya convertido a HTML (plantilla de React Email). Sale de la
 * dirección universal con el nombre de la agencia; `copia` es el buzón de la agencia que recibe
 * copia oculta (bcc) y las respuestas del cliente (reply-to), salvo que `responderA` indique otro.
 */
export async function enviarAviso({
  agencia,
  para,
  asunto,
  html,
  texto,
  copia,
  responderA: responderAgencia,
  modulo = "avisos",
}: {
  agencia: string;
  para: string;
  asunto: string;
  html: string;
  texto: string;
  copia?: string;
  responderA?: string;
  /** Etiqueta del envío en Resend. */
  modulo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { resend, remitente, responderA } = getConfigCorreo();
  const error = await despachar(resend, {
    from: remitenteDeAgencia(remitente, agencia),
    to: para,
    // Copia oculta: las ejecutivas se enteran sin que el cliente vea el buzón entre los destinatarios.
    bcc: copia && copia.toLowerCase() !== para.toLowerCase() ? copia : undefined,
    replyTo: responderAgencia ?? copia ?? responderA,
    subject: asunto,
    html,
    text: texto,
    tags: [{ name: "modulo", value: modulo }],
  });
  if (error && (error.statusCode === 401 || error.statusCode === 403)) {
    // Llave inválida o dominio no verificado: no tiene caso intentar con el resto.
    throw new CorreoNoConfiguradoError(`una configuración válida de Resend: ${error.message}`);
  }
  return { ok: !error, error: error?.message };
}
