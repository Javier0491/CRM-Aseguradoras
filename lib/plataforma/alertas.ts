import "server-only";

import { getEjecuciones, HORAS_SIN_CORRER } from "@/lib/plataforma/cron";
import { getEstadoMigraciones } from "@/lib/plataforma/migraciones";

export type AlertaPlataforma = { clave: string; titulo: string; detalle: string; grave: boolean };

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/**
 * Problemas de la plataforma que el SUPERADMIN debe atender: migraciones pendientes o fallidas
 * y la tarea diaria (avisos y cobranza) que falló, dejó de correr o nunca ha corrido.
 */
export async function getAlertasPlataforma(): Promise<AlertaPlataforma[]> {
  const alertas: AlertaPlataforma[] = [];
  const [migraciones, ejecuciones] = await Promise.all([
    getEstadoMigraciones().catch(() => null),
    getEjecuciones("diaria", 1).catch(() => null),
  ]);

  if (migraciones) {
    if (migraciones.fallidas.length > 0) {
      alertas.push({
        clave: "migracion-fallida",
        titulo: `Migración fallida: ${migraciones.fallidas[0].nombre}`,
        detalle: "La base de datos quedó a medias. Revisa el error en Diagnóstico antes de volver a desplegar.",
        grave: true,
      });
    }
    if (migraciones.pendientes && migraciones.pendientes.length > 0) {
      const n = migraciones.pendientes.length;
      alertas.push({
        clave: "migraciones-pendientes",
        titulo: `${n} ${n === 1 ? "migración pendiente" : "migraciones pendientes"} en la base de datos`,
        detalle: `Ejecuta «npx prisma migrate deploy»: el código desplegado espera ${migraciones.pendientes.join(", ")}.`,
        grave: true,
      });
    }
  }

  if (ejecuciones) {
    const ultima = ejecuciones[0];
    if (!process.env.CRON_SECRET) {
      alertas.push({
        clave: "cron-sin-secreto",
        titulo: "Falta CRON_SECRET",
        detalle: "Sin él la tarea diaria (avisos a clientes y cobranza de la plataforma) no puede ejecutarse.",
        grave: true,
      });
    } else if (!ultima) {
      alertas.push({
        clave: "cron-nunca",
        titulo: "La tarea diaria nunca se ha ejecutado",
        detalle:
          "Programa una llamada diaria a /api/cron/avisos (p. ej. un Cron Job de Vercel). Sin ella no salen los avisos ni corre la cobranza automática.",
        grave: false,
      });
    } else if (ultima.ok === false) {
      alertas.push({
        clave: "cron-fallo",
        titulo: `La tarea diaria falló el ${fechaHora.format(ultima.inicio)}`,
        detalle: ultima.error ?? "Sin detalle del error.",
        grave: true,
      });
    } else if (Date.now() - ultima.inicio.getTime() > HORAS_SIN_CORRER * 3_600_000) {
      alertas.push({
        clave: "cron-detenido",
        titulo: "La tarea diaria dejó de ejecutarse",
        detalle: `Su última ejecución fue el ${fechaHora.format(ultima.inicio)}. Revisa la tarea programada.`,
        grave: true,
      });
    }
  }
  return alertas;
}
