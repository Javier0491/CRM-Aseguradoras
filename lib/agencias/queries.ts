import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** Datos de la agencia (nombre y marca). Memoizado por render: lo usan el layout y las páginas. */
export const getAgencia = cache(async (agenciaId: string) => {
  return db.agencia.findUniqueOrThrow({
    where: { id: agenciaId },
    select: { id: true, nombre: true, logoUrl: true, colorHex: true, tema: true },
  });
});

/**
 * Todas las agencias, para el selector del SUPERADMIN. Es la única consulta que cruza agencias:
 * exige el rol aquí mismo (no confía en quien la llame) y solo expone id y nombre.
 */
export async function getAgenciasParaSuperadmin() {
  const user = await getCurrentUser();
  if (!user?.superadmin) return [];
  return db.agencia.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
}
