import "server-only";

import { connection } from "next/server";

import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export const LIMITE_BITACORA = 200;

export const ENTIDADES_BITACORA = {
  lote: "Conciliaciones",
  recibo: "Aclaraciones",
  poliza: "Pólizas",
  regla_comision: "Matriz de comisiones",
  usuario: "Usuarios",
  agencia: "Agencia",
  aseguradora: "Aseguradoras",
} as const;
export type EntidadBitacora = keyof typeof ENTIDADES_BITACORA;

export const esEntidadBitacora = (v: unknown): v is EntidadBitacora =>
  typeof v === "string" && v in ENTIDADES_BITACORA;

/**
 * Cuentas SUPERADMIN: sus movimientos no se muestran en la bitácora ni en el historial de las
 * pólizas (para nadie, tampoco para el propio SUPERADMIN). Siguen guardados en la base de datos.
 */
export async function superadminsOcultos(): Promise<{ ids: string[]; emails: string[] }> {
  const cuentas = await db.usuario.findMany({ where: { rolSistema: "SUPERADMIN" }, select: { id: true, email: true } });
  return { ids: cuentas.map((u) => u.id), emails: cuentas.map((u) => u.email.toLowerCase()) };
}

/**
 * Movimientos más recientes; `q` busca en la descripción y en el correo de quien lo hizo. Lo que
 * hacen las cuentas SUPERADMIN no aparece.
 */
export async function getBitacora({ q = "", entidad }: { q?: string; entidad?: EntidadBitacora }) {
  await connection();
  const [agenciaId, ocultos] = await Promise.all([getAgenciaId(), superadminsOcultos()]);
  const superadmins = ocultos.ids;
  const texto = q.trim().slice(0, 100);
  const where: Prisma.BitacoraWhereInput = {
    agenciaId,
    // Con OR para conservar los movimientos sin usuario (los del sistema): NOT IN descarta los NULL.
    ...(superadmins.length && {
      AND: [{ OR: [{ usuario_id: null }, { usuario_id: { notIn: superadmins } }] }],
    }),
    ...(entidad && { entidad }),
    ...(texto && {
      OR: [
        { descripcion: { contains: texto, mode: "insensitive" } },
        { usuario_email: { contains: texto, mode: "insensitive" } },
      ],
    }),
  };
  const [registros, total] = await Promise.all([
    db.bitacora.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: LIMITE_BITACORA,
      select: {
        id: true,
        created_at: true,
        usuario_email: true,
        accion: true,
        entidad: true,
        entidad_id: true,
        descripcion: true,
      },
    }),
    db.bitacora.count({ where }),
  ]);
  return { registros, total };
}
