import "server-only";

import { connection } from "next/server";

import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export const LIMITE_CLIENTES = 200;

/** Directorio de clientes con su número de pólizas; `q` busca en nombre, RFC, teléfono y correo. */
export async function getClientesListado(q = "") {
  await connection();
  const texto = q.trim().slice(0, 100);
  const contiene = { contains: texto, mode: "insensitive" as const };
  const where: Prisma.ClienteWhereInput = texto
    ? { OR: [{ nombre: contiene }, { rfc: contiene }, { telefono: contiene }, { email: contiene }] }
    : {};

  const [clientes, total, totalGeneral] = await Promise.all([
    db.cliente.findMany({
      where,
      orderBy: { nombre: "asc" },
      take: LIMITE_CLIENTES,
      select: {
        id: true,
        nombre: true,
        rfc: true,
        telefono: true,
        email: true,
        _count: { select: { polizas: true } },
      },
    }),
    db.cliente.count({ where }),
    db.cliente.count(),
  ]);
  return { clientes, total, totalGeneral };
}
