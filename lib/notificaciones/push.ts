import "server-only";

import webpush from "web-push";

import { db } from "@/lib/db";

export type AvisoPush = {
  titulo: string;
  cuerpo: string;
  /** Página que se abre al tocar la notificación. */
  url: string;
  /** Notificaciones con la misma etiqueta se reemplazan (p. ej. una por conversación). */
  etiqueta?: string;
};

let configurado: boolean | undefined;

/** Llaves VAPID del servidor; sin ellas no se envía nada (el CRM funciona igual). */
function configurar() {
  if (configurado !== undefined) return configurado;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const sujeto = process.env.VAPID_SUBJECT?.trim() || "mailto:servicio@magnusseguros.com";
  configurado = Boolean(publica && privada);
  if (configurado) webpush.setVapidDetails(sujeto, publica!, privada!);
  return configurado;
}

/**
 * Envía una notificación a todos los dispositivos donde cada persona activó las notificaciones.
 * `aviso` puede depender de la persona (p. ej. la página a la que lleva según su rol). Las
 * suscripciones que el navegador ya dio de baja se borran. Nunca lanza.
 */
export async function enviarPush(usuarioIds: readonly string[], aviso: AvisoPush | ((usuarioId: string) => AvisoPush)) {
  if (usuarioIds.length === 0 || !configurar()) return;
  try {
    const suscripciones = await db.suscripcionPush.findMany({
      where: { usuarioId: { in: [...new Set(usuarioIds)] } },
      select: { id: true, usuarioId: true, endpoint: true, p256dh: true, auth: true },
    });
    const vencidas: string[] = [];
    await Promise.all(
      suscripciones.map(async (s) => {
        const a = typeof aviso === "function" ? aviso(s.usuarioId) : aviso;
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(a),
            { TTL: 24 * 3600, urgency: "high", timeout: 8000 }
          );
        } catch (e) {
          const estado = (e as { statusCode?: number }).statusCode;
          // 404/410: el navegador revocó la suscripción (se desinstaló, se bloquearon los avisos…).
          if (estado === 404 || estado === 410) vencidas.push(s.id);
          else console.error("[push]", estado ?? (e instanceof Error ? e.message : e));
        }
      })
    );
    if (vencidas.length > 0) await db.suscripcionPush.deleteMany({ where: { id: { in: vencidas } } });
  } catch (e) {
    console.error("[push]", e instanceof Error ? e.message : e);
  }
}
