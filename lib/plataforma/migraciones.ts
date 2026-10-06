import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";

export type EstadoMigraciones = {
  /** Migraciones del código que la base de datos no tiene aplicadas (null si no se pudo leer la carpeta). */
  pendientes: string[] | null;
  /** Migraciones que empezaron y no terminaron (fallidas). */
  fallidas: { nombre: string; error: string | null }[];
  aplicadas: number;
};

/**
 * Compara las migraciones del código (prisma/migrations, incluidas en el despliegue con
 * outputFileTracingIncludes) contra la tabla _prisma_migrations de la base de datos.
 */
export async function getEstadoMigraciones(): Promise<EstadoMigraciones> {
  let locales: string[] | null = null;
  try {
    const entradas = await fs.readdir(path.join(process.cwd(), "prisma", "migrations"), { withFileTypes: true });
    locales = entradas.filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name)).map((e) => e.name).sort();
  } catch {
    locales = null;
  }
  const filas = await db.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null; logs: string | null }[]
  >`SELECT migration_name, finished_at, rolled_back_at, logs FROM _prisma_migrations ORDER BY started_at`;
  const aplicadas = new Set(filas.filter((f) => f.finished_at && !f.rolled_back_at).map((f) => f.migration_name));
  return {
    pendientes: locales ? locales.filter((m) => !aplicadas.has(m)) : null,
    fallidas: filas
      .filter((f) => !f.finished_at && !f.rolled_back_at)
      .map((f) => ({ nombre: f.migration_name, error: f.logs?.slice(0, 500) ?? null })),
    aplicadas: aplicadas.size,
  };
}
