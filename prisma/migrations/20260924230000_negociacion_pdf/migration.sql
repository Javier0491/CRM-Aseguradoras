-- Formato de negociación u orden de emisión (PDF) de GMM Colectivo, guardado en Storage.
-- AlterTable
ALTER TABLE "polizas" ADD COLUMN     "negociacion_bytes" INTEGER,
ADD COLUMN     "negociacion_nombre" TEXT,
ADD COLUMN     "negociacion_path" TEXT,
ADD COLUMN     "negociacion_subido_at" TIMESTAMP(3);
