-- CreateEnum
CREATE TYPE "FormaPago" AS ENUM ('ANUAL', 'SEMESTRAL', 'TRIMESTRAL', 'MENSUAL');

-- DropIndex
DROP INDEX "recibos_poliza_id_idx";

-- AlterTable
ALTER TABLE "polizas" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "datos_ramo" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "forma_pago" "FormaPago" NOT NULL,
ADD COLUMN     "prima_total" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "vigencia_fin" DATE NOT NULL,
ADD COLUMN     "vigencia_inicio" DATE NOT NULL;

-- AlterTable
ALTER TABLE "recibos" ADD COLUMN     "numero" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "polizas_created_at_idx" ON "polizas"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recibos_poliza_id_numero_key" ON "recibos"("poliza_id", "numero");

