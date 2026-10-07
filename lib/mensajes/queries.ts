import "server-only";

import type { UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  CLAVE_EQUIPO,
  MENSAJES_POR_PAGINA,
  type ConversacionResumen,
  type MensajeChat,
  type MiembroChat,
} from "@/lib/mensajes/reglas";

/**
 * El chat es del equipo de la agencia a la que pertenece la cuenta (no de la que esté operando un
 * SUPERADMIN): así nadie de fuera lee las conversaciones de una agencia.
 */
export const agenciaDelChat = (user: Pick<UsuarioSesion, "agenciaPropiaId">) => user.agenciaPropiaId;

/** Conversaciones de una persona: el canal del equipo y sus directas. */
const mias = (user: Pick<UsuarioSesion, "id" | "agenciaPropiaId">): Prisma.ConversacionWhereInput => ({
  agenciaId: agenciaDelChat(user),
  OR: [{ clave: CLAVE_EQUIPO }, { usuarioAId: user.id }, { usuarioBId: user.id }],
});

/** La conversación si la persona participa en ella (el canal del equipo o una directa suya). */
export function conversacionDe(user: Pick<UsuarioSesion, "id" | "agenciaPropiaId">, conversacionId: string) {
  return db.conversacion.findFirst({ where: { id: conversacionId, ...mias(user) }, select: { id: true, clave: true } });
}

/** El canal de toda la agencia; se crea la primera vez que alguien abre el chat. */
export async function asegurarEquipo(agenciaId: string) {
  return db.conversacion.upsert({
    where: { agenciaId_clave: { agenciaId, clave: CLAVE_EQUIPO } },
    create: { agenciaId, clave: CLAVE_EQUIPO },
    update: {},
    select: { id: true },
  });
}

export const SELECT_MENSAJE = {
  id: true,
  autorId: true,
  texto: true,
  createdAt: true,
  eliminadoAt: true,
  adjuntoClave: true,
  adjuntoNombre: true,
  adjuntoTipo: true,
  adjuntoBytes: true,
  adjuntoAncho: true,
  adjuntoAlto: true,
  autor: { select: { nombre: true } },
} as const satisfies Prisma.MensajeSelect;

/** El archivo se pide por esta ruta: verifica la sesión y redirige a una URL firmada de corta vigencia. */
export const urlAdjunto = (mensajeId: string) => `/api/mensajes/adjuntos/${mensajeId}`;

export const aMensajeChat = (m: Prisma.MensajeGetPayload<{ select: typeof SELECT_MENSAJE }>): MensajeChat => ({
  id: m.id,
  autorId: m.autorId,
  autor: m.autor?.nombre ?? "Usuario eliminado",
  // Lo eliminado ya no viaja al navegador.
  texto: m.eliminadoAt ? "" : m.texto,
  at: m.createdAt.toISOString(),
  eliminado: m.eliminadoAt !== null,
  adjunto:
    !m.eliminadoAt && m.adjuntoClave && m.adjuntoTipo
      ? {
          nombre: m.adjuntoNombre ?? "archivo",
          tipo: m.adjuntoTipo,
          bytes: m.adjuntoBytes ?? 0,
          ancho: m.adjuntoAncho,
          alto: m.adjuntoAlto,
          url: urlAdjunto(m.id),
        }
      : null,
});

/**
 * Página de mensajes de una conversación (del más antiguo al más reciente): los más recientes o,
 * con `antes`, los anteriores a ese mensaje. Se asume que ya se verificó la participación.
 */
export async function getMensajes(conversacionId: string, antes?: { at: Date; id: string }) {
  const filas = await db.mensaje.findMany({
    where: {
      conversacionId,
      ...(antes && { OR: [{ createdAt: { lt: antes.at } }, { createdAt: antes.at, id: { lt: antes.id } }] }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MENSAJES_POR_PAGINA + 1,
    select: SELECT_MENSAJE,
  });
  return {
    mensajes: filas.slice(0, MENSAJES_POR_PAGINA).reverse().map(aMensajeChat),
    hayMas: filas.length > MENSAJES_POR_PAGINA,
  };
}

/** Lo que se puede mostrar del último mensaje en la lista de conversaciones. */
const vistaPrevia = (texto: string) => texto.replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Conversaciones de la persona con su último mensaje y cuántos no ha leído: el canal del equipo
 * primero y después las directas, de la más reciente a la más antigua. Lo no leído es lo que
 * otros escribieron después de su marca de lectura (o, sin marca, después de que se creó su cuenta).
 */
export async function getResumenChat(user: Pick<UsuarioSesion, "id" | "agenciaPropiaId">) {
  const agenciaId = agenciaDelChat(user);
  let conversaciones = await db.conversacion.findMany({
    where: mias(user),
    orderBy: [{ ultimoMensajeAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true,
      clave: true,
      usuarioA: { select: { id: true, nombre: true, rol: true, activo: true } },
      usuarioB: { select: { id: true, nombre: true, rol: true, activo: true } },
    },
  });
  if (!conversaciones.some((c) => c.clave === CLAVE_EQUIPO)) {
    const equipo = await asegurarEquipo(agenciaId);
    conversaciones = [{ id: equipo.id, clave: CLAVE_EQUIPO, usuarioA: null, usuarioB: null }, ...conversaciones];
  }
  const ids = conversaciones.map((c) => c.id);

  const [ultimos, noLeidos] = await Promise.all([
    db.$queryRaw<{
      conversacion_id: string;
      texto: string;
      created_at: Date;
      eliminado: boolean;
      autor_id: string | null;
      autor: string | null;
      adjunto_tipo: string | null;
      adjunto_nombre: string | null;
    }[]>`
      SELECT DISTINCT ON (m.conversacion_id)
        m.conversacion_id, m.texto, m.created_at, (m.eliminado_at IS NOT NULL) AS eliminado, m.autor_id, u.nombre AS autor,
        m.adjunto_tipo, m.adjunto_nombre
      FROM mensajes m
      LEFT JOIN usuarios u ON u.id = m.autor_id
      WHERE m.agencia_id = ${agenciaId}::uuid AND m.conversacion_id = ANY(${ids})
      ORDER BY m.conversacion_id, m.created_at DESC, m.id DESC`,
    db.$queryRaw<{ conversacion_id: string; n: number }[]>`
      SELECT m.conversacion_id, count(*)::int AS n
      FROM mensajes m
      JOIN usuarios yo ON yo.id = ${user.id}
      LEFT JOIN conversaciones_lecturas l ON l.conversacion_id = m.conversacion_id AND l.usuario_id = ${user.id}
      WHERE m.agencia_id = ${agenciaId}::uuid
        AND m.conversacion_id = ANY(${ids})
        AND m.eliminado_at IS NULL
        AND (m.autor_id IS NULL OR m.autor_id <> ${user.id})
        AND m.created_at > COALESCE(l.leido_hasta, yo.created_at)
      GROUP BY m.conversacion_id`,
  ]);
  const ultimoDe = new Map(ultimos.map((u) => [u.conversacion_id, u]));
  const noLeidosDe = new Map(noLeidos.map((n) => [n.conversacion_id, n.n]));

  const lista: ConversacionResumen[] = conversaciones.map((c) => {
    const otro = c.clave === CLAVE_EQUIPO ? null : c.usuarioA?.id === user.id ? c.usuarioB : c.usuarioA;
    const u = ultimoDe.get(c.id);
    return {
      id: c.id,
      tipo: c.clave === CLAVE_EQUIPO ? "equipo" : "directa",
      titulo: c.clave === CLAVE_EQUIPO ? "Todo el equipo" : (otro?.nombre ?? "Usuario eliminado"),
      otro: otro ? { id: otro.id, nombre: otro.nombre, rol: otro.rol, activo: otro.activo } : null,
      ultimo: u
        ? {
            texto: u.eliminado ? "" : vistaPrevia(u.texto),
            autor: u.autor ?? "Usuario eliminado",
            mio: u.autor_id === user.id,
            at: u.created_at.toISOString(),
            eliminado: u.eliminado,
            adjunto:
              !u.eliminado && u.adjunto_tipo ? { tipo: u.adjunto_tipo, nombre: u.adjunto_nombre ?? "archivo" } : null,
          }
        : null,
      noLeidos: noLeidosDe.get(c.id) ?? 0,
    };
  });
  // El canal del equipo siempre arriba.
  lista.sort((a, b) => Number(b.tipo === "equipo") - Number(a.tipo === "equipo"));
  return { conversaciones: lista, noLeidos: lista.reduce((s, c) => s + c.noLeidos, 0) };
}

/** Con quién se puede iniciar una conversación: las cuentas activas de la agencia, sin la propia. */
export async function getMiembrosChat(user: Pick<UsuarioSesion, "id" | "agenciaPropiaId">): Promise<MiembroChat[]> {
  const filas = await db.usuario.findMany({
    where: { agenciaId: agenciaDelChat(user), activo: true, id: { not: user.id } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, rol: true, rolSistema: true },
  });
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, rol: f.rolSistema === "SUPERADMIN" ? "SUPERADMIN" : f.rol }));
}
