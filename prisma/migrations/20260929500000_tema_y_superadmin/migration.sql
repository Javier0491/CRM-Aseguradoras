-- Tema de la interfaz por agencia y rol de plataforma SUPERADMIN.

-- Fondo de la interfaz de la agencia ("dark" u "light").
ALTER TABLE "agencias" ADD COLUMN "tema" TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE "agencias" ADD CONSTRAINT "agencias_tema_check" CHECK ("tema" IN ('dark', 'light'));

-- SUPERADMIN: puede operar cualquier agencia. agencia_activa_id es la que está operando
-- (null = la propia); la sesión la escribe en el claim app_metadata.agencia_id del JWT, así que
-- RLS y Storage siguen a la agencia activa. No se asigna desde la app: solo con
-- prisma/asignar-superadmin.ts. La política RLS de usuarios es de solo lectura, así que nadie
-- puede darse este rol ni cambiar su agencia activa por la API.
CREATE TYPE "RolSistema" AS ENUM ('USER', 'SUPERADMIN');
ALTER TABLE "usuarios"
  ADD COLUMN "rol_sistema" "RolSistema" NOT NULL DEFAULT 'USER',
  ADD COLUMN "agencia_activa_id" UUID;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_agencia_activa_id_fkey"
  FOREIGN KEY ("agencia_activa_id") REFERENCES "agencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
