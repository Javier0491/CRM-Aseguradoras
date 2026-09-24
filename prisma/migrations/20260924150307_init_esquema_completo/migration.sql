-- DropForeignKey
ALTER TABLE "polizas" DROP CONSTRAINT "polizas_cliente_id_fkey";

-- DropForeignKey
ALTER TABLE "recibos" DROP CONSTRAINT "recibos_poliza_id_fkey";

-- DropIndex
DROP INDEX "polizas_numero_poliza_vigor_key";

-- CreateIndex
CREATE INDEX "polizas_numero_poliza_vigor_idx" ON "polizas"("numero_poliza_vigor");

-- CreateIndex
CREATE INDEX "polizas_vigencia_fin_idx" ON "polizas"("vigencia_fin");

-- CreateIndex
CREATE INDEX "recibos_fecha_vencimiento_idx" ON "recibos"("fecha_vencimiento");

-- AddForeignKey
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_poliza_id_fkey" FOREIGN KEY ("poliza_id") REFERENCES "polizas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
