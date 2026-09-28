// Da el rol ADMIN a una cuenta existente de Supabase Auth (creando su perfil si falta).
// Sirve para el primer administrador y para recuperar el acceso si nadie más es ADMIN.
//   npx tsx prisma/asignar-admin.ts correo@dominio.com ["Nombre visible"]
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! }) });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Uso: npx tsx prisma/asignar-admin.ts correo@dominio.com [\"Nombre\"]");

  const [cuenta] = await db.$queryRaw<{ id: string; email: string }[]>`
    SELECT id::text, email FROM auth.users WHERE lower(email) = ${email} LIMIT 1`;
  if (!cuenta) throw new Error(`No existe una cuenta de Supabase Auth con el correo ${email}.`);

  const nombre = process.argv[3]?.trim() || email.split("@")[0];
  const usuario = await db.usuario.upsert({
    where: { id: cuenta.id },
    update: { rol: "ADMIN" },
    create: { id: cuenta.id, email, nombre, rol: "ADMIN" },
  });
  console.log(`${usuario.email} ahora es ${usuario.rol}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
