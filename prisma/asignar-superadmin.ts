// Da (o quita, con --quitar) el rol de plataforma SUPERADMIN a una cuenta que ya tiene perfil en
// el CRM. Es la única forma de asignarlo: la app no tiene pantalla para esto y la política RLS
// de usuarios es de solo lectura.
//   npx tsx prisma/asignar-superadmin.ts correo@dominio.com [--quitar]
// El cambio aplica desde la siguiente solicitud del usuario (la sesión lee el rol de la base).
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! }) });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const quitar = process.argv.includes("--quitar");
  if (!email || email.startsWith("--")) {
    throw new Error("Uso: npx tsx prisma/asignar-superadmin.ts correo@dominio.com [--quitar]");
  }

  const perfil = await db.usuario.findUnique({ where: { email }, select: { id: true } });
  if (!perfil) throw new Error(`${email} no tiene perfil en el CRM (créalo primero, p. ej. con asignar-admin.ts).`);

  const usuario = await db.usuario.update({
    where: { id: perfil.id },
    // Al quitar el rol también vuelve a su propia agencia.
    data: quitar ? { rolSistema: "USER", agenciaActivaId: null } : { rolSistema: "SUPERADMIN" },
    select: { email: true, rolSistema: true, agencia: { select: { nombre: true } } },
  });
  console.log(`${usuario.email} (${usuario.agencia.nombre}) ahora es ${usuario.rolSistema}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
