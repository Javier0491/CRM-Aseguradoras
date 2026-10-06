-- Embudo de renovaciones: etapa del seguimiento de cada póliza por renovar.
CREATE TYPE "EtapaRenovacion" AS ENUM ('COTIZANDO', 'ENVIADA', 'PERDIDA');

ALTER TABLE "polizas" ADD COLUMN "renovacion_etapa" "EtapaRenovacion";
ALTER TABLE "polizas" ADD COLUMN "renovacion_nota" TEXT;
ALTER TABLE "polizas" ADD COLUMN "renovacion_etapa_at" TIMESTAMP(3);
