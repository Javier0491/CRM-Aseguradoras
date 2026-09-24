-- Matriz de comisiones por aseguradora, ramo y año; % personalizado por póliza; rastro de conciliación en recibos.
-- AlterTable
ALTER TABLE "polizas" ADD COLUMN     "comision_personalizada_pct" DECIMAL(5,2);
-- AlterTable
ALTER TABLE "recibos" ADD COLUMN     "comision_pagada" DECIMAL(14,2),
ADD COLUMN     "conciliado_at" TIMESTAMP(3);
-- CreateTable
CREATE TABLE "esquemas_comision" (
    "id" TEXT NOT NULL,
    "aseguradora_id" TEXT NOT NULL,
    "ramo" "Ramo" NOT NULL,
    "anio_poliza" INTEGER NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    CONSTRAINT "esquemas_comision_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "esquemas_comision_aseguradora_id_ramo_anio_poliza_key" ON "esquemas_comision"("aseguradora_id", "ramo", "anio_poliza");
-- AddForeignKey
ALTER TABLE "esquemas_comision" ADD CONSTRAINT "esquemas_comision_aseguradora_id_fkey" FOREIGN KEY ("aseguradora_id") REFERENCES "aseguradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
