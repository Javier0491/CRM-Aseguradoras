"use server";

import { after } from "next/server";

import { getAlmacen } from "@/lib/archivos/almacen";
import type { SubidaFirmada } from "@/lib/archivos/almacen/tipos";
import { getCurrentUser, type UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  BYTES_FIRMA,
  claveAdjunto,
  claveAdjuntoValida,
  esImagen,
  esTipoAdjunto,
  MAX_BYTES_ADJUNTO,
  nombreAdjunto,
  TIPOS_ADJUNTO,
} from "@/lib/mensajes/adjuntos";
import { aMensajeChat, agenciaDelChat, conversacionDe, getMensajes, SELECT_MENSAJE } from "@/lib/mensajes/queries";
import { CLAVE_EQUIPO, claveDirecta, validarTextoMensaje, type MensajeChat } from "@/lib/mensajes/reglas";
import { avisarConversacion, notificarMensaje } from "@/lib/mensajes/tiempo-real";

const SESION = "Tu sesión expiró. Vuelve a iniciar sesión.";
const ID = /^[\w-]{1,64}$/;

type Usuario = Pick<UsuarioSesion, "id" | "agenciaPropiaId">;
/** A dónde va un mensaje: una conversación en la que participa la persona o una cuenta de su agencia. */
export type DestinoMensaje = { conversacionId?: string; para?: string };

/**
 * Valida el destino. Con `crear`, la conversación directa con `para` se crea si no existía (con el
 * primer mensaje); sin él solo se verifica que esa persona exista (para preparar un adjunto).
 */
async function resolverDestino(
  user: Usuario,
  destino: DestinoMensaje,
  crear: boolean
): Promise<{ ok: true; conversacionId: string | null } | { ok: false; error: string }> {
  if (typeof destino !== "object" || destino === null) return { ok: false, error: "Datos inválidos." };
  const agenciaId = agenciaDelChat(user);
  if (typeof destino.conversacionId === "string") {
    if (!ID.test(destino.conversacionId)) return { ok: false, error: "Datos inválidos." };
    const c = await conversacionDe(user, destino.conversacionId);
    return c ? { ok: true, conversacionId: c.id } : { ok: false, error: "La conversación ya no existe." };
  }
  if (typeof destino.para !== "string" || !ID.test(destino.para) || destino.para === user.id) {
    return { ok: false, error: "Elige con quién conversar." };
  }
  // Solo con cuentas activas de la misma agencia.
  const otro = await db.usuario.findFirst({ where: { id: destino.para, agenciaId, activo: true }, select: { id: true } });
  if (!otro) return { ok: false, error: "Esa persona ya no está activa en la agencia." };
  if (!crear) return { ok: true, conversacionId: null };
  const d = claveDirecta(user.id, otro.id);
  const c = await db.conversacion.upsert({
    where: { agenciaId_clave: { agenciaId, clave: d.clave } },
    create: { agenciaId, ...d },
    update: {},
    select: { id: true },
  });
  return { ok: true, conversacionId: c.id };
}

/** Marca de lectura hasta `hasta` (nunca hacia atrás). */
async function marcarHasta(tx: Prisma.TransactionClient, user: Usuario, conversacionId: string, hasta: Date) {
  const clave = { conversacionId_usuarioId: { conversacionId, usuarioId: user.id } };
  const actual = await tx.conversacionLectura.findUnique({ where: clave, select: { leidoHasta: true } });
  if (actual && actual.leidoHasta >= hasta) return;
  await tx.conversacionLectura.upsert({
    where: clave,
    create: { conversacionId, usuarioId: user.id, agenciaId: agenciaDelChat(user), leidoHasta: hasta },
    update: { leidoHasta: hasta },
  });
}

export type PrepararAdjuntoResultado = ({ ok: true; clave: string } & SubidaFirmada) | { ok: false; error: string };

/**
 * Paso 1 de un adjunto: valida el archivo y devuelve una URL firmada para que el navegador lo suba
 * directo al almacenamiento (no pasa por el servidor de Next). El mensaje se envía después con
 * la clave (enviarMensaje), que verifica lo que de verdad se subió.
 */
export async function prepararAdjunto(
  destino: DestinoMensaje,
  archivo: { tipo: string; bytes: number }
): Promise<PrepararAdjuntoResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof archivo !== "object" || archivo === null || !esTipoAdjunto(archivo.tipo)) {
    return { ok: false, error: "Ese tipo de archivo no se puede enviar por el chat." };
  }
  if (typeof archivo.bytes !== "number" || !Number.isInteger(archivo.bytes) || archivo.bytes <= 0 || archivo.bytes > MAX_BYTES_ADJUNTO) {
    return { ok: false, error: "El archivo está vacío o pasa de 25 MB." };
  }
  const d = await resolverDestino(user, destino, false);
  if (!d.ok) return d;
  const clave = claveAdjunto(agenciaDelChat(user), archivo.tipo);
  try {
    const firmada = await getAlmacen().urlSubida(clave, archivo.tipo, archivo.bytes);
    return { ok: true, clave, ...firmada };
  } catch (e) {
    console.error("[chat] prepararAdjunto", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo preparar la subida del archivo." };
  }
}

export type AdjuntoEnviado = { clave: string; nombre: string; tipo: string; ancho?: number; alto?: number };

/** Verifica en el almacenamiento el archivo que el navegador dice haber subido. */
async function verificarAdjunto(agenciaId: string, raw: AdjuntoEnviado) {
  if (typeof raw !== "object" || raw === null || !esTipoAdjunto(raw.tipo) || !claveAdjuntoValida(raw.clave, agenciaId, raw.tipo)) {
    return { ok: false as const, error: "Archivo inválido." };
  }
  const almacen = getAlmacen();
  const [info, inicio] = await Promise.all([almacen.info(raw.clave), almacen.leerInicio(raw.clave, BYTES_FIRMA)]);
  if (!info || !inicio) return { ok: false as const, error: "El archivo no terminó de subirse; vuelve a intentarlo." };
  if (info.bytes <= 0 || info.bytes > MAX_BYTES_ADJUNTO || !TIPOS_ADJUNTO[raw.tipo].firma(inicio)) {
    // No es lo que dice ser: no se liga a ningún mensaje.
    after(() => almacen.eliminar([raw.clave]).catch(() => {}));
    return { ok: false as const, error: "El archivo está dañado o no es del tipo que indica su nombre." };
  }
  const medida = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 20_000 ? v : null);
  const imagen = esImagen(raw.tipo);
  return {
    ok: true as const,
    datos: {
      adjuntoClave: raw.clave,
      adjuntoNombre: nombreAdjunto(raw.nombre),
      adjuntoTipo: raw.tipo,
      adjuntoBytes: info.bytes,
      adjuntoAncho: imagen ? medida(raw.ancho) : null,
      adjuntoAlto: imagen ? medida(raw.alto) : null,
    },
  };
}

export type EnviarMensajeResultado =
  | { ok: true; conversacionId: string; mensaje: MensajeChat }
  | { ok: false; error: string };

/**
 * Envía un mensaje (texto y, opcionalmente, un archivo ya subido) a una conversación en la que
 * participa la persona o a otra cuenta de su agencia: la directa se crea con el primer mensaje.
 * Después avisa al instante a los participantes.
 */
export async function enviarMensaje(
  entrada: DestinoMensaje & { texto: string; adjunto?: AdjuntoEnviado }
): Promise<EnviarMensajeResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Datos inválidos." };
  const v = validarTextoMensaje(entrada.texto, { conAdjunto: entrada.adjunto !== undefined });
  if (!v.ok) return v;
  const agenciaId = agenciaDelChat(user);

  let adjunto: Awaited<ReturnType<typeof verificarAdjunto>> | null = null;
  if (entrada.adjunto !== undefined) {
    adjunto = await verificarAdjunto(agenciaId, entrada.adjunto);
    if (!adjunto.ok) return adjunto;
  }
  const d = await resolverDestino(user, entrada, true);
  if (!d.ok || !d.conversacionId) return d.ok ? { ok: false, error: "Datos inválidos." } : d;
  const conversacionId = d.conversacionId;

  let mensaje;
  try {
    mensaje = await db.$transaction(async (tx) => {
      const m = await tx.mensaje.create({
        data: { agenciaId, conversacionId, autorId: user.id, texto: v.texto, ...(adjunto?.ok && adjunto.datos) },
        select: SELECT_MENSAJE,
      });
      await tx.conversacion.update({ where: { id: conversacionId, agenciaId }, data: { ultimoMensajeAt: m.createdAt } });
      // Lo propio ya está leído.
      await marcarHasta(tx, user, conversacionId, m.createdAt);
      return m;
    });
  } catch (e) {
    // El mismo archivo no se liga a dos mensajes.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Ese archivo ya se envió." };
    }
    throw e;
  }
  const enviado = aMensajeChat(mensaje);
  after(async () => {
    await avisarConversacion(conversacionId, agenciaId);
    await notificarMensaje(conversacionId, agenciaId, {
      autorId: user.id,
      autor: user.nombre ?? user.email ?? "Alguien del equipo",
      texto: enviado.texto,
      adjunto: enviado.adjunto && { tipo: enviado.adjunto.tipo, nombre: enviado.adjunto.nombre },
    });
  });
  return { ok: true, conversacionId, mensaje: enviado };
}

/** Marca como leída una conversación hasta el mensaje que la persona alcanzó a ver (ISO). */
export async function marcarConversacionLeida(conversacionId: string, hastaIso: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || typeof conversacionId !== "string" || !ID.test(conversacionId) || typeof hastaIso !== "string") {
    return { ok: false };
  }
  const hasta = new Date(hastaIso);
  if (Number.isNaN(hasta.getTime())) return { ok: false };
  const c = await conversacionDe(user, conversacionId);
  if (!c) return { ok: false };
  // Nunca más allá de ahora: una fecha futura dejaría sin avisar los mensajes que vengan.
  const ahora = new Date();
  await db.$transaction((tx) => marcarHasta(tx, user, c.id, hasta > ahora ? ahora : hasta));
  return { ok: true };
}

/**
 * Borra un mensaje: su autor, o un administrador si es del canal del equipo. Queda "Mensaje
 * eliminado" en su lugar; su texto y su archivo se borran.
 */
export async function eliminarMensaje(mensajeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof mensajeId !== "string" || !ID.test(mensajeId)) return { ok: false, error: "Datos inválidos." };
  const agenciaId = agenciaDelChat(user);
  const m = await db.mensaje.findFirst({
    where: { id: mensajeId, agenciaId, eliminadoAt: null },
    select: { id: true, autorId: true, conversacionId: true, adjuntoClave: true, conversacion: { select: { clave: true } } },
  });
  if (!m || !(await conversacionDe(user, m.conversacionId))) return { ok: false, error: "El mensaje ya no existe." };
  // El administrador modera el canal del equipo (si es de su propia agencia), no las directas ajenas.
  const modera = m.conversacion.clave === CLAVE_EQUIPO && user.rol === "ADMIN" && user.agenciaId === agenciaId;
  if (m.autorId !== user.id && !modera) return { ok: false, error: "Solo puedes borrar tus propios mensajes." };
  await db.mensaje.update({
    where: { id: m.id, agenciaId },
    data: {
      eliminadoAt: new Date(),
      texto: "",
      adjuntoClave: null,
      adjuntoNombre: null,
      adjuntoTipo: null,
      adjuntoBytes: null,
      adjuntoAncho: null,
      adjuntoAlto: null,
    },
  });
  const clave = m.adjuntoClave;
  after(async () => {
    if (clave) await getAlmacen().eliminar([clave]).catch((e) => console.error("[chat] borrar adjunto", e instanceof Error ? e.message : e));
    await avisarConversacion(m.conversacionId, agenciaId);
  });
  return { ok: true };
}

export type AnterioresResultado = { ok: true; mensajes: MensajeChat[]; hayMas: boolean } | { ok: false; error: string };

/** Mensajes anteriores a uno ya mostrado (para "Ver anteriores"). */
export async function cargarMensajesAnteriores(conversacionId: string, antes: { id: string; at: string }): Promise<AnterioresResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof conversacionId !== "string" || !ID.test(conversacionId) || typeof antes !== "object" || antes === null) {
    return { ok: false, error: "Datos inválidos." };
  }
  const at = new Date(antes.at);
  if (typeof antes.id !== "string" || !ID.test(antes.id) || Number.isNaN(at.getTime())) {
    return { ok: false, error: "Datos inválidos." };
  }
  const c = await conversacionDe(user, conversacionId);
  if (!c) return { ok: false, error: "La conversación ya no existe." };
  return { ok: true, ...(await getMensajes(c.id, { at, id: antes.id })) };
}
