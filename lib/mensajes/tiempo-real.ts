import "server-only";

import { db } from "@/lib/db";
import { esImagen } from "@/lib/mensajes/adjuntos";
import { CLAVE_EQUIPO } from "@/lib/mensajes/reglas";
import { enviarPush } from "@/lib/notificaciones/push";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { esRolSoloTareas } from "@/lib/usuarios/reglas";

/** Quienes participan en una conversación (con su rol): todo el equipo activo, o los dos de una directa. */
async function participantesDe(conversacionId: string, agenciaId: string) {
  const c = await db.conversacion.findFirst({
    where: { id: conversacionId, agenciaId },
    select: { clave: true, usuarioAId: true, usuarioBId: true },
  });
  if (!c) return null;
  const ids = c.clave === CLAVE_EQUIPO ? undefined : [c.usuarioAId, c.usuarioBId].filter((id): id is string => Boolean(id));
  const usuarios = await db.usuario.findMany({
    where: { agenciaId, activo: true, ...(ids && { id: { in: ids } }) },
    select: { id: true, rol: true },
  });
  return { equipo: c.clave === CLAVE_EQUIPO, usuarios };
}

/**
 * Notificación push de un mensaje nuevo a los demás participantes (llega aunque no tengan el CRM
 * abierto). Al tocarla se abre la conversación. Nunca lanza.
 */
export async function notificarMensaje(
  conversacionId: string,
  agenciaId: string,
  m: { autorId: string; autor: string; texto: string; adjunto: { tipo: string; nombre: string } | null }
) {
  try {
    const p = await participantesDe(conversacionId, agenciaId);
    if (!p) return;
    const destinatarios = p.usuarios.filter((u) => u.id !== m.autorId);
    const rol = new Map(destinatarios.map((u) => [u.id, u.rol]));
    const cuerpo = m.texto || (m.adjunto ? (esImagen(m.adjunto.tipo) ? "📷 Foto" : `📎 ${m.adjunto.nombre}`) : "");
    await enviarPush(
      destinatarios.map((u) => u.id),
      (id) => ({
        titulo: p.equipo ? `${m.autor} · Todo el equipo` : m.autor,
        cuerpo: cuerpo.length > 140 ? `${cuerpo.slice(0, 140)}…` : cuerpo,
        // Quien solo usa Tareas no tiene dashboard: el chat se abre sobre su página.
        url: `${esRolSoloTareas(rol.get(id) ?? "") ? "/tareas" : "/"}?chat=${conversacionId}`,
        etiqueta: `chat-${conversacionId}`,
      })
    );
  } catch (e) {
    console.error("[chat] notificación push", e instanceof Error ? e.message : e);
  }
}

/**
 * Tema privado de cada persona en Supabase Realtime. La política "chat: cada quien escucha su
 * tema" (realtime.messages) solo deja escuchar el propio; publicar, solo el servidor.
 */
export const temaChat = (usuarioId: string) => `chat:${usuarioId}`;

/**
 * Avisa al instante a los participantes de una conversación (incluido quien escribió, por sus
 * otras pestañas) que cambió: el aviso solo lleva el id y cada navegador vuelve a consultar el
 * chat con su sesión. Sin Realtime configurado no hace nada: el chat sigue consultando solo.
 * Nunca lanza.
 */
export async function avisarConversacion(conversacionId: string, agenciaId: string) {
  const config = getSupabaseConfig();
  const secreta = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secreta) return;
  try {
    const p = await participantesDe(conversacionId, agenciaId);
    const ids = p?.usuarios.map((u) => u.id) ?? [];
    if (ids.length === 0) return;
    // Un solo envío con un mensaje por tema (API REST de Broadcast de Realtime).
    const r = await fetch(`${config.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: secreta, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: ids.map((id) => ({ topic: temaChat(id), event: "cambio", payload: { conversacionId }, private: true })),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (r.status !== 202) console.error("[chat] aviso en tiempo real", r.status);
  } catch (e) {
    console.error("[chat] aviso en tiempo real", e instanceof Error ? e.message : e);
  }
}
