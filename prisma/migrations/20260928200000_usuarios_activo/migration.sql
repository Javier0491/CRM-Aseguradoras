-- Borrado suave de cuentas del equipo: una cuenta desactivada no puede iniciar sesión.
-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "desactivado_at" TIMESTAMP(3);
