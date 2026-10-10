-- Promotoría deja de ser un plan: sus agencias pasan a Broker Pro, que ahora tiene sus mismos
-- límites (usuarios y escaneos con IA sin límite).
UPDATE "agencias" SET "plan" = 'BROKER', "edicion_plan" = 'PRO' WHERE "plan" = 'PROMOTORIA';

ALTER TYPE "PlanAgencia" RENAME TO "PlanAgencia_old";
CREATE TYPE "PlanAgencia" AS ENUM ('AGENTE', 'BROKER');
ALTER TABLE "agencias" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "agencias" ALTER COLUMN "plan" TYPE "PlanAgencia" USING ("plan"::text::"PlanAgencia");
ALTER TABLE "agencias" ALTER COLUMN "plan" SET DEFAULT 'AGENTE';
DROP TYPE "PlanAgencia_old";
