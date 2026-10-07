import "server-only";

import { connection } from "next/server";

import { esAdmin, type UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export const LIMITE_LOTES = 20;

/**
 * Últimos lotes de conciliación aplicados, con lo que cambió cada uno. Quien solo ve su cartera
 * ve únicamente los que aplicó; `puedeRevertir`: el administrador, cualquiera; el ejecutivo, los suyos.
 */
export async function getLotes(usuario: UsuarioSesion) {
  await connection();
  const lotes = await db.loteConciliacion.findMany({
    where: { agenciaId: usuario.agenciaId, ...(usuario.soloSuCartera && { usuario_id: usuario.id }) },
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
      usuario_id: true,
      aseguradora: { select: { nombre: true, color_hex: true } },
    },
  });
  const admin = esAdmin(usuario);
  return lotes.map(({ usuario_id, ...l }) => ({
    ...l,
    created_at: l.created_at.toISOString(),
    revertido_at: l.revertido_at?.toISOString() ?? null,
    puedeRevertir: admin || usuario_id === usuario.id,
  }));
}
export type LoteResumen = Awaited<ReturnType<typeof getLotes>>[number];
