-- AlterTable
ALTER TABLE "polizas" ADD COLUMN     "caratula_bytes" INTEGER,
ADD COLUMN     "caratula_nombre" TEXT,
ADD COLUMN     "caratula_path" TEXT,
ADD COLUMN     "caratula_subido_at" TIMESTAMP(3);
