import { timingSafeEqual } from "node:crypto";

import { procesarAvisos, type ResumenAvisos } from "@/lib/avisos/procesar";
import { CorreoNoConfiguradoError } from "@/lib/comunicaciones/envio";
import { ejecutarConRegistro } from "@/lib/plataforma/cron";
import { procesarCobranzaPlataforma, type ResumenCobranza } from "@/lib/plataforma/procesar-cobranza";
import { recordarTareasDelDia } from "@/lib/tareas/recordatorio";

// Los avisos se envían uno por uno para respetar el límite de Resend.
export const maxDuration = 300;

function autorizado(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return null;
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

const mensaje = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/**
 * GET /api/cron/avisos — tarea diaria de la plataforma: la cobranza del servicio a las agencias
 * (avisos de pago y suspensión automática) y los avisos automáticos a los clientes (recibos por
 * vencer, vencidos y renovaciones) de todas las agencias. Lo llama una tarea programada diaria con
 * el encabezado `Authorization: Bearer <CRON_SECRET>`; no usa la sesión de ningún usuario. Cada
 * ejecución queda registrada y, si falla, se avisa a los superadministradores.
 */
export async function GET(request: Request) {
  const ok = autorizado(request);
  if (ok === null) return Response.json({ ok: false, error: "Falta CRON_SECRET en el servidor." }, { status: 503 });
  if (!ok) return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });

  let correoNoConfigurado: string | null = null;
  try {
    const { resumen, fallas } = await ejecutarConRegistro("diaria", async () => {
      const fallas: string[] = [];
      // Cada paso es independiente: si uno falla, el otro corre igual.
      let cobranza: ResumenCobranza | null = null;
      try {
        cobranza = await procesarCobranzaPlataforma();
        if (cobranza.errores.length > 0) fallas.push(`Cobranza: ${cobranza.errores.join("; ")}`);
      } catch (e) {
        fallas.push(`Cobranza: ${mensaje(e)}`);
      }
      let avisos: ResumenAvisos | null = null;
      try {
        avisos = await procesarAvisos();
      } catch (e) {
        if (e instanceof CorreoNoConfiguradoError) correoNoConfigurado = e.message;
        fallas.push(`Avisos: ${mensaje(e)}`);
      }
      // Recordatorio de tareas del día (notificaciones push del navegador).
      let tareas: number | null = null;
      try {
        tareas = await recordarTareasDelDia();
      } catch (e) {
        fallas.push(`Recordatorio de tareas: ${mensaje(e)}`);
      }
      return { resumen: { cobranza, avisos, tareas }, fallas };
    });
    if (correoNoConfigurado) return Response.json({ ok: false, error: correoNoConfigurado, ...resumen }, { status: 503 });
    if (fallas.length > 0) return Response.json({ ok: false, error: fallas.join(" | "), ...resumen }, { status: 500 });
    return Response.json({ ok: true, ...resumen });
  } catch (e) {
    console.error("[cron/avisos]", mensaje(e));
    return Response.json({ ok: false, error: "No fue posible completar la tarea diaria." }, { status: 500 });
  }
}
