"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type SuscripcionNavegador = { endpoint: string; keys: { p256dh: string; auth: string } };

const URL_PUSH = /^https:\/\/[^\s]{10,2000}$/;
const LLAVE = /^[A-Za-z0-9_-]{10,200}$/;

/** Guarda (o mueve a la cuenta actual) la suscripción push de este navegador. */
export async function guardarSuscripcionPush(s: SuscripcionNavegador): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || typeof s !== "object" || s === null) return { ok: false };
  const { endpoint, keys } = s;
  if (typeof endpoint !== "string" || !URL_PUSH.test(endpoint) || typeof keys !== "object" || keys === null) return { ok: false };
  if (!LLAVE.test(String(keys.p256dh)) || !LLAVE.test(String(keys.auth))) return { ok: false };
  // Un navegador compartido: la suscripción pasa a quien inició sesión ahora.
  await db.suscripcionPush.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, usuarioId: user.id, agenciaId: user.agenciaPropiaId },
    update: { p256dh: keys.p256dh, auth: keys.auth, usuarioId: user.id, agenciaId: user.agenciaPropiaId },
  });
  return { ok: true };
}

/** Da de baja la suscripción de este navegador (solo la propia). */
export async function quitarSuscripcionPush(endpoint: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || typeof endpoint !== "string") return { ok: false };
  await db.suscripcionPush.deleteMany({ where: { endpoint, usuarioId: user.id } });
  return { ok: true };
}
