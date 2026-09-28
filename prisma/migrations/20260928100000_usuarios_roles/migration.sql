-- Roles del equipo (RBAC). La autenticación sigue en Supabase Auth; esta tabla guarda el
-- perfil y el rol de cada cuenta, con el mismo id que auth.users.
-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'EJECUTIVO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'EJECUTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- Nadie debe poder leer ni cambiar roles por la API REST de Supabase (p. ej. un ejecutivo
-- ascendiéndose a ADMIN con su propio token): RLS sin políticas bloquea a anon y
-- authenticated. La aplicación se conecta como dueña de la tabla, a la que RLS no aplica.
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "usuarios" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "usuarios" FROM authenticated;
  END IF;
END $$;
