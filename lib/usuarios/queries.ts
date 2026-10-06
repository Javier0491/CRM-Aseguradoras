import "server-only";

import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type OpcionEjecutivo = { id: string; nombre: string };

/**
 * Cuentas activas de la agencia a las que se les puede asignar cartera (clientes, pólizas y
 * tareas). Las cuentas SUPERADMIN no se ofrecen: operan la plataforma, no una cartera.
 */
export async function getEjecutivos(agenciaId: string): Promise<OpcionEjecutivo[]> {
  return db.usuario.findMany({
    where: { agenciaId, activo: true, rolSistema: "USER" },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
}

/** Cuentas del equipo de la agencia con su último acceso (de Supabase Auth). */
export async function getUsuarios() {
  const agenciaId = await getAgenciaId();
  const usuarios = await db.usuario.findMany({
    where: { agenciaId },
    // Activos primero; dentro de cada grupo, administradores y luego por nombre.
    orderBy: [{ activo: "desc" }, { rol: "asc" }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true,
      desactivado_at: true,
      created_at: true,
      _count: {
        select: {
          polizasAsignadas: true,
          clientesAsignados: true,
          tareasAsignadas: { where: { completadaAt: null } },
        },
      },
    },
  });
  // Solo las cuentas de la agencia: auth.users es de todo el SaaS.
  const ids = usuarios.map((u) => u.id);
  const accesos = ids.length
    ? await db.$queryRaw<{ id: string; last_sign_in_at: Date | null }[]>`
        SELECT id::text, last_sign_in_at FROM auth.users WHERE id::text = ANY(${ids})`
    : [];
  const ultimoAcceso = new Map(accesos.map((a) => [a.id, a.last_sign_in_at]));
  return usuarios.map((u) => ({ ...u, ultimoAcceso: ultimoAcceso.get(u.id) ?? null }));
}
