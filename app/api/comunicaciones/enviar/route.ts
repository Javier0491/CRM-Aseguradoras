import { getMarcaCorreo } from "@/lib/agencias/queries";
import { alcanceDe } from "@/lib/auth/alcance";
import { getUsuarioCrm } from "@/lib/auth/dal";
import type { Attachment } from "resend";

import {
  adjuntoPermitido,
  cuerpoVacio,
  EXTENSIONES_ADJUNTO,
  MAX_ADJUNTOS,
  MAX_ASUNTO,
  MAX_BYTES_CUERPO,
  MAX_BYTES_SOLICITUD,
  MAX_DESTINATARIOS,
  type DestinatarioCorreo,
  type EnviarCorreoRespuesta,
  type EnviarCorreoSolicitud,
} from "@/lib/comunicaciones/correo";
import {
  CorreoNoConfiguradoError,
  emailValido,
  enviarCorreos,
  getConfigCorreo,
  ImagenInvalidaError,
} from "@/lib/comunicaciones/envio";
import { getDestinatarios } from "@/lib/comunicaciones/queries";

// Los envíos masivos se hacen uno por uno para respetar el límite de Resend.
export const maxDuration = 300;

function error(mensaje: string, status: number) {
  return Response.json({ ok: false, error: mensaje } satisfies EnviarCorreoRespuesta, { status });
}

const MB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Lee la solicitud: multipart con "solicitud" (JSON) y los archivos en "adjuntos", o JSON sin adjuntos. */
async function leerSolicitud(request: Request): Promise<{ solicitud: EnviarCorreoSolicitud; archivos: File[] } | null> {
  try {
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const datos = await request.formData();
      const json = datos.get("solicitud");
      if (typeof json !== "string") return null;
      const archivos = datos.getAll("adjuntos").filter((a): a is File => a instanceof File);
      return { solicitud: JSON.parse(json), archivos };
    }
    return { solicitud: await request.json(), archivos: [] };
  } catch {
    return null;
  }
}

/** Valida los archivos adjuntos y los convierte al formato de Resend; o dice por qué no. */
async function adjuntosDe(archivos: File[]): Promise<Attachment[] | string> {
  if (archivos.length > MAX_ADJUNTOS) return `Se pueden adjuntar como máximo ${MAX_ADJUNTOS} archivos.`;
  const adjuntos: Attachment[] = [];
  for (const a of archivos) {
    const nombre = a.name.replace(/[\\/\r\n"]/g, "_").trim().slice(0, 200);
    if (!nombre || !adjuntoPermitido(nombre)) {
      return `No se puede adjuntar «${nombre || "archivo sin nombre"}». Tipos permitidos: ${EXTENSIONES_ADJUNTO.join(", ")}.`;
    }
    if (a.size === 0) return `El archivo «${nombre}» está vacío.`;
    adjuntos.push({ filename: nombre, content: Buffer.from(await a.arrayBuffer()) });
  }
  return adjuntos;
}

/**
 * POST /api/comunicaciones/enviar
 * Multipart: "solicitud" (JSON, ver EnviarCorreoSolicitud: asunto, html del editor y
 * destinatarios `"todos"` o IDs de clientes) y los archivos adjuntos en "adjuntos"; también
 * acepta el JSON solo. Con `prueba: true` envía solo al usuario de la sesión. Las direcciones
 * siempre se leen de la base de datos, nunca del navegador.
 */
export async function POST(request: Request) {
  const usuario = await getUsuarioCrm();
  if (!usuario) return error("No autenticado.", 401);

  const largo = Number(request.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES_SOLICITUD) {
    return error(`El correo con sus imágenes y adjuntos pesa más de ${MB(MAX_BYTES_SOLICITUD)}. Quita o reduce archivos.`, 413);
  }

  const leida = await leerSolicitud(request);
  if (!leida) return error("La solicitud no es válida.", 400);
  const { solicitud } = leida;
  if (typeof solicitud !== "object" || solicitud === null) return error("La solicitud no es válida.", 400);
  const archivos = await adjuntosDe(leida.archivos);
  if (typeof archivos === "string") return error(archivos, 400);

  const asunto = typeof solicitud.asunto === "string" ? solicitud.asunto.trim() : "";
  const html = typeof solicitud.html === "string" ? solicitud.html : "";
  if (!asunto) return error("Escribe el asunto del correo.", 400);
  if (asunto.length > MAX_ASUNTO) return error(`El asunto admite como máximo ${MAX_ASUNTO} caracteres.`, 400);
  if (cuerpoVacio(html)) return error("El cuerpo del correo está vacío.", 400);
  if (html.length > MAX_BYTES_CUERPO) return error("El correo es demasiado grande. Reduce el tamaño de las imágenes.", 413);

  try {
    getConfigCorreo();
  } catch (e) {
    if (e instanceof CorreoNoConfiguradoError) return error(e.message, 503);
    throw e;
  }

  let destinatarios: DestinatarioCorreo[];
  if (solicitud.prueba) {
    if (!usuario.email) return error("Tu usuario no tiene un correo para recibir la prueba.", 400);
    destinatarios = [{ id: "prueba", nombre: "Cliente de prueba", email: usuario.email }];
  } else if (solicitud.destinatarios === "todos") {
    destinatarios = await getDestinatarios(alcanceDe(usuario));
  } else if (
    Array.isArray(solicitud.destinatarios) &&
    solicitud.destinatarios.every((id) => typeof id === "string")
  ) {
    if (solicitud.destinatarios.length === 0) return error("Selecciona al menos un destinatario.", 400);
    if (solicitud.destinatarios.length > MAX_DESTINATARIOS) {
      return error(`Se pueden enviar como máximo ${MAX_DESTINATARIOS} correos a la vez.`, 400);
    }
    destinatarios = await getDestinatarios(alcanceDe(usuario), [...new Set(solicitud.destinatarios)]);
  } else {
    return error("Destinatarios no válidos.", 400);
  }

  // Un mismo correo registrado en varios clientes se envía una sola vez.
  const vistos = new Set<string>();
  const validos = destinatarios.filter((d) => {
    const clave = d.email.toLowerCase();
    if (!emailValido(d.email) || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  const omitidos = destinatarios.length - validos.length;

  if (validos.length === 0) return error("Ninguno de los destinatarios tiene un correo válido.", 400);
  if (validos.length > MAX_DESTINATARIOS) {
    return error(
      `Hay ${validos.length} destinatarios y el máximo por envío es ${MAX_DESTINATARIOS}. Divide el envío en grupos.`,
      400
    );
  }

  try {
    const marca = await getMarcaCorreo(usuario.agenciaId);
    const resultados = await enviarCorreos({ asunto, html, destinatarios: validos, marca, archivos });
    const enviados = resultados.filter((r) => r.ok).length;
    return Response.json({
      ok: true,
      enviados,
      fallidos: resultados.length - enviados,
      omitidos,
      resultados,
    } satisfies EnviarCorreoRespuesta);
  } catch (e) {
    if (e instanceof ImagenInvalidaError) return error(e.message, 422);
    if (e instanceof CorreoNoConfiguradoError) return error(e.message, 503);
    console.error("[comunicaciones] Error al enviar:", e instanceof Error ? `${e.name}: ${e.message}` : e);
    return error("No fue posible enviar los correos.", 502);
  }
}
