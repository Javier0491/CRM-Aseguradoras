import "server-only";

import { connection } from "next/server";

import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** Clientes de la agencia con correo capturado; `ids` limita a una selección. */
export async function getDestinatarios(agenciaId: string, ids?: string[]) {
  const clientes = await db.cliente.findMany({
    where: { agenciaId, email: { not: "" }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true },
  });
  return clientes.map((c) => ({ ...c, email: c.email.trim() }));
}

/** Lista para el selector de destinatarios y cuántos clientes no tienen correo. */
export async function getDirectorioCorreo() {
  await connection();
  const agenciaId = await getAgenciaId();
  const [clientes, sinCorreo] = await Promise.all([
    getDestinatarios(agenciaId),
    db.cliente.count({ where: { agenciaId, email: "" } }),
  ]);
  return { clientes, sinCorreo };
}
