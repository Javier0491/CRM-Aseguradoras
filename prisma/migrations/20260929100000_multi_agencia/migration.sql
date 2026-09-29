-- SaaS multi-agencia: cada registro de negocio pertenece a una agencia (tenant).
-- Los datos existentes quedan en la agencia inicial "PJ MAGNUS", con id fijo para poder
-- referenciarla desde el código (lib/agencias/constantes.ts).
--
-- TEMPORAL: agencia_id tiene como DEFAULT esa agencia para que las escrituras que aún no
-- pasan la agencia de la sesión sigan funcionando. El ADD COLUMN ... NOT NULL DEFAULT
-- también rellena todas las filas existentes.

-- CreateTable
CREATE TABLE "agencias" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "logo_url" TEXT,
    "color_hex" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencias_pkey" PRIMARY KEY ("id")
);

-- Agencia inicial (antes de que las columnas nuevas apunten a ella).
INSERT INTO "agencias" ("id", "nombre", "created_at", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', 'PJ MAGNUS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);


-- DropIndex
DROP INDEX "aseguradoras_nombre_key";

-- DropIndex
DROP INDEX "polizas_numero_poliza_original_key";

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "aseguradoras" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "polizas" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "recibos" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "asegurados" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "esquemas_comision" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "bitacora" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "lotes_conciliacion" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "lotes_cambios" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "notas_aclaracion" ADD COLUMN     "agencia_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- CreateIndex
CREATE INDEX "usuarios_agencia_id_idx" ON "usuarios"("agencia_id");

-- CreateIndex
CREATE INDEX "clientes_agencia_id_idx" ON "clientes"("agencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "aseguradoras_agencia_id_nombre_key" ON "aseguradoras"("agencia_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "polizas_agencia_id_numero_poliza_original_key" ON "polizas"("agencia_id", "numero_poliza_original");

-- CreateIndex
CREATE INDEX "recibos_agencia_id_idx" ON "recibos"("agencia_id");

-- CreateIndex
CREATE INDEX "asegurados_agencia_id_idx" ON "asegurados"("agencia_id");

-- CreateIndex
CREATE INDEX "esquemas_comision_agencia_id_idx" ON "esquemas_comision"("agencia_id");

-- CreateIndex
CREATE INDEX "bitacora_agencia_id_idx" ON "bitacora"("agencia_id");

-- CreateIndex
CREATE INDEX "lotes_conciliacion_agencia_id_idx" ON "lotes_conciliacion"("agencia_id");

-- CreateIndex
CREATE INDEX "lotes_cambios_agencia_id_idx" ON "lotes_cambios"("agencia_id");

-- CreateIndex
CREATE INDEX "notas_aclaracion_agencia_id_idx" ON "notas_aclaracion"("agencia_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aseguradoras" ADD CONSTRAINT "aseguradoras_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asegurados" ADD CONSTRAINT "asegurados_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esquemas_comision" ADD CONSTRAINT "esquemas_comision_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_conciliacion" ADD CONSTRAINT "lotes_conciliacion_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_cambios" ADD CONSTRAINT "lotes_cambios_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_aclaracion" ADD CONSTRAINT "notas_aclaracion_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Igual que las demás tablas: sin acceso por la API REST de Supabase (anon/authenticated).
-- La aplicación se conecta como dueña de la tabla, a la que RLS no aplica. Las políticas
-- por agencia (auth.jwt() -> 'app_metadata' ->> 'agencia_id') llegarán en otra migración.
ALTER TABLE "agencias" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "agencias" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "agencias" FROM authenticated;
  END IF;
END $$;
