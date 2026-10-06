import "server-only";

import { connection } from "next/server";

import { clientesDe, getAlcance, type Alcance } from "@/lib/auth/alcance";
import { db } from "@/lib/db";

/** Clientes visibles con correo capturado; `ids` limita a una selección. */
export async function getDestinatarios(alcance: Alcance, ids?: string[]) {
  const clientes = await db.cliente.findMany({
    where: { AND: [clientesDe(alcance), { email: { not: "" } }, ids ? { id: { in: ids } } : {}] },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true },
  });
  return clientes.map((c) => ({ ...c, email: c.email.trim() }));
}

/** Lista para el selector de destinatarios y cuántos clientes no tienen correo. */
export async function getDirectorioCorreo() {
  await connection();
  const alcance = await getAlcance();
  const [clientes, sinCorreo] = await Promise.all([
    getDestinatarios(alcance),
    db.cliente.count({ where: { AND: [clientesDe(alcance), { email: "" }] } }),
  ]);
  return { clientes, sinCorreo };
}
