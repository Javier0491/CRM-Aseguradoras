-- Ediciones de los planes Agente y Broker: Básico (sin captura con IA) y Pro (con IA). Las
-- agencias existentes quedan en Pro: conservan exactamente los límites que tenían.
CREATE TYPE "EdicionPlan" AS ENUM ('BASICO', 'PRO');

ALTER TABLE "agencias" ADD COLUMN "edicion_plan" "EdicionPlan" NOT NULL DEFAULT 'PRO';
