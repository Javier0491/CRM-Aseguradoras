import "server-only";

import { connection } from "next/server";

import { db } from "@/lib/db";

/** Clientes con correo capturado; `ids` limita a una selección. */
export async function getDestinatarios(ids?: string[]) {
  const clientes = await db.cliente.findMany({
    where: { email: { not: "" }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true },
  });
  return clientes.map((c) => ({ ...c, email: c.email.trim() }));
}

/** Lista para el selector de destinatarios y cuántos clientes no tienen correo. */
export async function getDirectorioCorreo() {
  await connection();
  const [clientes, sinCorreo] = await Promise.all([
    getDestinatarios(),
    db.cliente.count({ where: { email: "" } }),
  ]);
  return { clientes, sinCorreo };
}
