import { timingSafeEqual } from "node:crypto";

import { procesarAvisos } from "@/lib/avisos/procesar";
import { CorreoNoConfiguradoError } from "@/lib/comunicaciones/envio";

// Los avisos se envían uno por uno para respetar el límite de Resend.
export const maxDuration = 300;

function autorizado(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return null;
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/**
 * GET /api/cron/avisos — envía los avisos automáticos del día (recibos por vencer, vencidos y
 * renovaciones) de todas las agencias. Lo llama una tarea programada diaria con el encabezado
 * `Authorization: Bearer <CRON_SECRET>`; no usa la sesión de ningún usuario.
 */
export async function GET(request: Request) {
  const ok = autorizado(request);
  if (ok === null) return Response.json({ ok: false, error: "Falta CRON_SECRET en el servidor." }, { status: 503 });
  if (!ok) return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });

  try {
    return Response.json({ ok: true, ...(await procesarAvisos()) });
  } catch (e) {
    if (e instanceof CorreoNoConfiguradoError) return Response.json({ ok: false, error: e.message }, { status: 503 });
    console.error("[cron/avisos]", e instanceof Error ? `${e.name}: ${e.message}` : e);
    return Response.json({ ok: false, error: "No fue posible enviar los avisos." }, { status: 500 });
  }
}
