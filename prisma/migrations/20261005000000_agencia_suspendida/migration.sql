-- Suspensión de una agencia por el SUPERADMIN (p. ej. falta de pago).
ALTER TABLE "agencias" ADD COLUMN "suspendida" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agencias" ADD COLUMN "suspendida_at" TIMESTAMP(3);
ALTER TABLE "agencias" ADD COLUMN "motivo_suspension" TEXT;
