-- PDF oficial de la aseguradora que sube el robot cotizador junto con el resultado.
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "pdf_clave" TEXT;
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "pdf_bytes" INTEGER;
