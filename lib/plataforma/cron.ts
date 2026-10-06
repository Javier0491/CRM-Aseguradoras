import "server-only";

import { COLOR_MARCA_PREDETERMINADO } from "@/lib/agencias/marca";
import { emailValido, enviarCorreoPlataforma } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { Prisma } from "@/lib/generated/prisma/client";
import { logoPlataformaUrl, nombrePlataforma } from "@/lib/plataforma/marca";

/** La tarea diaria se da por detenida si su última ejecución tiene más de estas horas. */
export const HORAS_SIN_CORRER = 30;

/** Resultado de una tarea programada: su resumen y los pasos que fallaron (vacío = todo bien). */
export type ResultadoTarea = { resumen: Record<string, unknown>; fallas: string[] };

/**
 * Ejecuta una tarea programada y deja su registro (inicio, fin, resumen y fallas) en
 * ejecuciones_cron. Si falla, avisa por correo a las cuentas SUPERADMIN (si el correo funciona).
 * Un error inesperado se registra y se vuelve a lanzar.
 */
export async function ejecutarConRegistro(tarea: string, fn: () => Promise<ResultadoTarea>): Promise<ResultadoTarea> {
  const ejecucion = await db.ejecucionCron.create({ data: { tarea }, select: { id: true } });
  let resultado: ResultadoTarea;
  try {
    resultado = await fn();
  } catch (e) {
    const error = (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 2000);
    await db.ejecucionCron.update({ where: { id: ejecucion.id }, data: { fin: new Date(), ok: false, error } }).catch(() => {});
    await avisarFalla(tarea, error);
    throw e;
  }
  const ok = resultado.fallas.length === 0;
  await db.ejecucionCron.update({
    where: { id: ejecucion.id },
    data: {
      fin: new Date(),
      ok,
      resumen: resultado.resumen as Prisma.InputJsonObject,
      error: ok ? null : resultado.fallas.join(" | ").slice(0, 2000),
    },
  });
  if (!ok) await avisarFalla(tarea, resultado.fallas.join("\n"));
  return resultado;
}

/** Correo a las cuentas SUPERADMIN con el error de la tarea. Nunca lanza: si el correo es lo que falla, se registra. */
async function avisarFalla(tarea: string, error: string) {
  try {
    const superadmins = await db.usuario.findMany({
      where: { rolSistema: "SUPERADMIN", activo: true },
      select: { email: true },
    });
    const para = superadmins.map((s) => s.email).filter(emailValido);
    if (para.length === 0) return;
    const { html, texto } = await renderNotificacionCrm({
      nombreCrm: nombrePlataforma(),
      colorTema: COLOR_MARCA_PREDETERMINADO,
      logoUrl: logoPlataformaUrl(),
      nombreUsuario: "superadministrador",
      tituloNotificacion: `Falló la tarea programada «${tarea}»`,
      mensajePrincipal: [
        "La tarea programada no terminó bien. Este es el error:",
        error,
        "Revisa Plataforma → Diagnóstico para ver el detalle y las últimas ejecuciones.",
      ].join("\n"),
    });
    await enviarCorreoPlataforma({ para, asunto: `Falló la tarea programada «${tarea}»`, html, texto });
  } catch (e) {
    console.error("[cron] no se pudo avisar la falla", e instanceof Error ? e.message : e);
  }
}

/** Últimas ejecuciones de una tarea, la más reciente primero. */
export async function getEjecuciones(tarea: string, limite = 10) {
  return db.ejecucionCron.findMany({
    where: { tarea },
    orderBy: { inicio: "desc" },
    take: limite,
    select: { id: true, inicio: true, fin: true, ok: true, resumen: true, error: true },
  });
}
