import "server-only";

import { connection } from "next/server";

import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export const LIMITE_LOTES = 20;

/** Últimos lotes de conciliación aplicados, con lo que cambió cada uno. */
export async function getLotes() {
  await connection();
  const agenciaId = await getAgenciaId();
  const lotes = await db.loteConciliacion.findMany({
    where: { agenciaId },
    orderBy: { created_at: "desc" },
    take: LIMITE_LOTES,
    select: {
      id: true,
      created_at: true,
      archivo_nombre: true,
      usuario_email: true,
      renglones: true,
      conciliados: true,
      pagados: true,
      creados: true,
      revertido_at: true,
      revertido_por: true,
      aseguradora: { select: { nombre: true, color_hex: true } },
    },
  });
  return lotes.map((l) => ({
    ...l,
    created_at: l.created_at.toISOString(),
    revertido_at: l.revertido_at?.toISOString() ?? null,
  }));
}
export type LoteResumen = Awaited<ReturnType<typeof getLotes>>[number];
