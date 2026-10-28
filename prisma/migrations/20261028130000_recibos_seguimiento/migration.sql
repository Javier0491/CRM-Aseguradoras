-- Recibo marcado como pagado a mano (cobrado fuera de la conciliación).
ALTER TYPE "EstadoRecibo" ADD VALUE IF NOT EXISTS 'PAGADO_MANUAL' BEFORE 'CONCILIADO';

-- Recibos que vencieron más de 30 días antes de capturar su póliza: no llevan seguimiento.
ALTER TABLE "recibos" ADD COLUMN "historico" BOOLEAN NOT NULL DEFAULT false;
UPDATE "recibos" r
SET "historico" = true
FROM "polizas" p
WHERE p."id" = r."poliza_id"
  AND r."fecha_vencimiento" < (p."created_at"::date - 30);
