"use server";

import { getCurrentUser, type UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { aMensajeChat, agenciaDelChat, conversacionDe, getMensajes, SELECT_MENSAJE } from "@/lib/mensajes/queries";
import { CLAVE_EQUIPO, claveDirecta, validarTextoMensaje, type MensajeChat } from "@/lib/mensajes/reglas";

const SESION = "Tu sesión expiró. Vuelve a iniciar sesión.";
const ID = /^[\w-]{1,64}$/;

/** Marca de lectura hasta `hasta` (nunca hacia atrás). */
async function marcarHasta(
  tx: Prisma.TransactionClient,
  user: Pick<UsuarioSesion, "id" | "agenciaPropiaId">,
  conversacionId: string,
  hasta: Date
) {
  const clave = { conversacionId_usuarioId: { conversacionId, usuarioId: user.id } };
  const actual = await tx.conversacionLectura.findUnique({ where: clave, select: { leidoHasta: true } });
  if (actual && actual.leidoHasta >= hasta) return;
  await tx.conversacionLectura.upsert({
    where: clave,
    create: { conversacionId, usuarioId: user.id, agenciaId: agenciaDelChat(user), leidoHasta: hasta },
    update: { leidoHasta: hasta },
  });
}

export type EnviarMensajeResultado =
  | { ok: true; conversacionId: string; mensaje: MensajeChat }
  | { ok: false; error: string };

/**
 * Envía un mensaje a una conversación en la que participa la persona (`conversacionId`) o a otra
 * cuenta de su agencia (`para`): la conversación directa se crea con el primer mensaje.
 */
export async function enviarMensaje(entrada: { conversacionId?: string; para?: string; texto: string }): Promise<EnviarMensajeResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Datos inválidos." };
  const v = validarTextoMensaje(entrada.texto);
  if (!v.ok) return v;
  const agenciaId = agenciaDelChat(user);

  let conversacionId: string;
  if (typeof entrada.conversacionId === "string") {
    if (!ID.test(entrada.conversacionId)) return { ok: false, error: "Datos inválidos." };
    const c = await conversacionDe(user, entrada.conversacionId);
    if (!c) return { ok: false, error: "La conversación ya no existe." };
    conversacionId = c.id;
  } else if (typeof entrada.para === "string" && ID.test(entrada.para) && entrada.para !== user.id) {
    // Solo con cuentas activas de la misma agencia.
    const otro = await db.usuario.findFirst({ where: { id: entrada.para, agenciaId, activo: true }, select: { id: true } });
    if (!otro) return { ok: false, error: "Esa persona ya no está activa en la agencia." };
    const d = claveDirecta(user.id, otro.id);
    const c = await db.conversacion.upsert({
      where: { agenciaId_clave: { agenciaId, clave: d.clave } },
      create: { agenciaId, ...d },
      update: {},
      select: { id: true },
    });
    conversacionId = c.id;
  } else {
    return { ok: false, error: "Elige con quién conversar." };
  }

  const mensaje = await db.$transaction(async (tx) => {
    const m = await tx.mensaje.create({
      data: { agenciaId, conversacionId, autorId: user.id, texto: v.texto },
      select: SELECT_MENSAJE,
    });
    await tx.conversacion.update({ where: { id: conversacionId, agenciaId }, data: { ultimoMensajeAt: m.createdAt } });
    // Lo propio ya está leído.
    await marcarHasta(tx, user, conversacionId, m.createdAt);
    return m;
  });
  return { ok: true, conversacionId, mensaje: aMensajeChat(mensaje) };
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
 * eliminado" en su lugar y su texto se borra.
 */
export async function eliminarMensaje(mensajeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof mensajeId !== "string" || !ID.test(mensajeId)) return { ok: false, error: "Datos inválidos." };
  const agenciaId = agenciaDelChat(user);
  const m = await db.mensaje.findFirst({
    where: { id: mensajeId, agenciaId, eliminadoAt: null },
    select: { id: true, autorId: true, conversacionId: true, conversacion: { select: { clave: true } } },
  });
  if (!m || !(await conversacionDe(user, m.conversacionId))) return { ok: false, error: "El mensaje ya no existe." };
  // El administrador modera el canal del equipo (si es de su propia agencia), no las directas ajenas.
  const modera = m.conversacion.clave === CLAVE_EQUIPO && user.rol === "ADMIN" && user.agenciaId === agenciaId;
  if (m.autorId !== user.id && !modera) return { ok: false, error: "Solo puedes borrar tus propios mensajes." };
  await db.mensaje.update({ where: { id: m.id, agenciaId }, data: { eliminadoAt: new Date(), texto: "" } });
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
