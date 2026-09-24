-- Referencia al expediente completo (ZIP) de respaldo guardado en Supabase Storage.
ALTER TABLE "polizas" ADD COLUMN     "expediente_bytes" INTEGER,
ADD COLUMN     "expediente_nombre" TEXT,
ADD COLUMN     "expediente_path" TEXT,
ADD COLUMN     "expediente_subido_at" TIMESTAMP(3);
