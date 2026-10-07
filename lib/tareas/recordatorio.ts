import "server-only";

import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import { enviarPush } from "@/lib/notificaciones/push";

/**
 * Recordatorio de la mañana (tarea programada diaria): a cada persona con partes pendientes que
 * vencen hoy o ya vencieron, una notificación push con cuántas son. Devuelve a cuántas personas
 * se les avisó.
 */
export async function recordarTareasDelDia(): Promise<number> {
  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const partes = await db.tareaResponsable.findMany({
    where: {
      completadaAt: null,
      usuario: { activo: true },
      tarea: { eliminadaAt: null, completadaAt: null, vence: { lte: hoy } },
    },
    select: { usuarioId: true, tarea: { select: { vence: true } } },
  });
  const porPersona = new Map<string, { hoy: number; vencidas: number }>();
  for (const p of partes) {
    const c = porPersona.get(p.usuarioId) ?? { hoy: 0, vencidas: 0 };
    if (p.tarea.vence < hoy) c.vencidas++;
    else c.hoy++;
    porPersona.set(p.usuarioId, c);
  }
  for (const [usuarioId, c] of porPersona) {
    const total = c.hoy + c.vencidas;
    await enviarPush([usuarioId], {
      titulo: total === 1 ? "Tienes 1 tarea para hoy" : `Tienes ${total} tareas para hoy`,
      cuerpo:
        c.vencidas > 0
          ? `${c.vencidas === 1 ? "1 ya venció" : `${c.vencidas} ya vencieron`}: empieza por ${c.vencidas === 1 ? "esa" : "ellas"}.`
          : "Revisa tus pendientes del día.",
      url: "/tareas",
      etiqueta: "tareas-del-dia",
    });
  }
  return porPersona.size;
}
