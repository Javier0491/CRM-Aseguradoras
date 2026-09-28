import "server-only";

import { db } from "@/lib/db";

/** Cuentas del equipo con su último acceso (de Supabase Auth). */
export async function getUsuarios() {
  const [usuarios, accesos] = await Promise.all([
    db.usuario.findMany({
      orderBy: [{ rol: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, email: true, rol: true, created_at: true },
    }),
    db.$queryRaw<{ id: string; last_sign_in_at: Date | null }[]>`
      SELECT id::text, last_sign_in_at FROM auth.users`,
  ]);
  const ultimoAcceso = new Map(accesos.map((a) => [a.id, a.last_sign_in_at]));
  return usuarios.map((u) => ({ ...u, ultimoAcceso: ultimoAcceso.get(u.id) ?? null }));
}
