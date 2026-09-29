import "server-only";

import { connection } from "next/server";

import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export const LIMITE_CLIENTES = 200;

/** Directorio de clientes con su número de pólizas; `q` busca en nombre, RFC, teléfono y correo. */
export async function getClientesListado(q = "") {
  await connection();
  const agenciaId = await getAgenciaId();
  const texto = q.trim().slice(0, 100);
  const contiene = { contains: texto, mode: "insensitive" as const };
  const where: Prisma.ClienteWhereInput = texto
    ? { agenciaId, OR: [{ nombre: contiene }, { rfc: contiene }, { telefono: contiene }, { email: contiene }] }
    : { agenciaId };

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
    db.cliente.count({ where: { agenciaId } }),
  ]);
  return { clientes, total, totalGeneral };
}

/** Expediente del cliente: contacto y todas sus pólizas (las más recientes primero). */
export async function getClienteExpediente(id: string) {
  await connection();
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  const agenciaId = await getAgenciaId();
  return db.cliente.findUnique({
    where: { id, agenciaId },
    select: {
      id: true,
      nombre: true,
      rfc: true,
      telefono: true,
      email: true,
      polizas: {
        orderBy: [{ vigencia_fin: "desc" }, { numeroImpreso: "asc" }],
        select: {
          id: true,
          numeroImpreso: true,
          polizaVigor: true,
          ramo: true,
          vigencia_inicio: true,
          vigencia_fin: true,
          prima_total: true,
          forma_pago: true,
          aseguradora: { select: { nombre: true, color_hex: true } },
          recibos: { select: { estado: true } },
        },
      },
    },
  });
}
