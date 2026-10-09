-- Planes de suscripción de ZenSecure (Agente, Broker, Promotoría) y su ciclo de cobro. Los límites
-- de cada plan (usuarios activos y escaneos con IA al mes) viven en lib/planes/planes.ts.
CREATE TYPE "PlanAgencia" AS ENUM ('AGENTE', 'BROKER', 'PROMOTORIA');
CREATE TYPE "CicloFacturacion" AS ENUM ('MENSUAL', 'ANUAL');

-- Las agencias que ya operan quedan en Promotoría (sin límites) para no cortarles usuarios ni
-- escaneos: el SUPERADMIN les asigna su plan en Cobranza. Las que se den de alta después nacen
-- en Agente.
ALTER TABLE "agencias"
  ADD COLUMN "plan" "PlanAgencia" NOT NULL DEFAULT 'PROMOTORIA',
  ADD COLUMN "ciclo_facturacion" "CicloFacturacion" NOT NULL DEFAULT 'MENSUAL';
ALTER TABLE "agencias" ALTER COLUMN "plan" SET DEFAULT 'AGENTE';

-- Escaneos de carátulas con IA por agencia y mes.
CREATE TABLE "uso_ocr" (
    "agencia_id" UUID NOT NULL,
    "periodo" DATE NOT NULL,
    "escaneos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "uso_ocr_pkey" PRIMARY KEY ("agencia_id","periodo"),
    CONSTRAINT "uso_ocr_escaneos_check" CHECK ("escaneos" >= 0)
);

ALTER TABLE "uso_ocr" ADD CONSTRAINT "uso_ocr_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mismo aislamiento que el resto: solo el servidor la lee y la escribe.
ALTER TABLE "uso_ocr" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "uso_ocr" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "uso_ocr";
  CREATE POLICY "misma agencia" ON "uso_ocr" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
