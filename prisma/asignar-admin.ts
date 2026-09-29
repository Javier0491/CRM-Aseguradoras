// Da el rol ADMIN a una cuenta existente de Supabase Auth (creando su perfil si falta).
// Sirve para el primer administrador de una agencia y para recuperar el acceso si nadie más
// es ADMIN. Si el perfil no existe hay que indicar su agencia (salvo que solo exista una).
//   npx tsx prisma/asignar-admin.ts correo@dominio.com ["Nombre visible"] [agenciaId]
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
  const perfil = await db.usuario.findUnique({ where: { id: cuenta.id }, select: { agenciaId: true } });
  const agenciaId = perfil?.agenciaId ?? (await agenciaParaPerfilNuevo(process.argv[4]?.trim()));
  const usuario = await db.usuario.upsert({
    where: { id: cuenta.id },
    // Un perfil existente conserva su agencia: este script no mueve cuentas entre agencias.
    update: { rol: "ADMIN" },
    create: { id: cuenta.id, agenciaId, email, nombre, rol: "ADMIN" },
    select: { email: true, rol: true, agencia: { select: { nombre: true } } },
  });
  console.log(`${usuario.email} ahora es ${usuario.rol} de ${usuario.agencia.nombre}.`);
}

/** La agencia indicada, o la única que existe; si hay varias hay que elegirla. */
async function agenciaParaPerfilNuevo(agenciaId: string | undefined) {
  if (agenciaId) {
    const agencia = await db.agencia.findUnique({ where: { id: agenciaId }, select: { id: true } });
    if (!agencia) throw new Error(`No existe la agencia ${agenciaId}.`);
    return agencia.id;
  }
  const agencias = await db.agencia.findMany({ select: { id: true, nombre: true }, take: 2 });
  if (agencias.length === 1) return agencias[0].id;
  throw new Error(
    agencias.length === 0
      ? "No hay agencias registradas."
      : "Hay varias agencias: indica el id de la agencia como tercer argumento."
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
