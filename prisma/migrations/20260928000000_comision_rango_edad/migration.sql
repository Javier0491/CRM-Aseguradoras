-- Rango de edad opcional en la matriz de comisiones (GMM). Varias reglas pueden compartir
-- aseguradora, ramo y año si su rango de edad es distinto, así que el índice deja de ser único.
-- DropIndex
DROP INDEX "esquemas_comision_aseguradora_id_ramo_anio_poliza_key";

-- AlterTable
ALTER TABLE "esquemas_comision" ADD COLUMN     "edad_maxima" INTEGER,
ADD COLUMN     "edad_minima" INTEGER;

-- CreateIndex
CREATE INDEX "esquemas_comision_aseguradora_id_ramo_anio_poliza_idx" ON "esquemas_comision"("aseguradora_id", "ramo", "anio_poliza");
