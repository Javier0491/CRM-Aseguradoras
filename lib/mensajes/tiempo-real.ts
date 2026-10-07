import "server-only";

import { db } from "@/lib/db";
import { CLAVE_EQUIPO } from "@/lib/mensajes/reglas";
import { getSupabaseConfig } from "@/lib/supabase/config";

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
    const c = await db.conversacion.findFirst({
      where: { id: conversacionId, agenciaId },
      select: { clave: true, usuarioAId: true, usuarioBId: true },
    });
    if (!c) return;
    const ids =
      c.clave === CLAVE_EQUIPO
        ? (await db.usuario.findMany({ where: { agenciaId, activo: true }, select: { id: true } })).map((u) => u.id)
        : [c.usuarioAId, c.usuarioBId].filter((id): id is string => Boolean(id));
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
