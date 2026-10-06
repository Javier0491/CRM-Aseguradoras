-- Cancelación de pólizas (sin borrarlas) y endosos.

-- Recibos pendientes de una póliza cancelada: ya no se cobran. El valor nuevo no se usa en esta
-- migración (PostgreSQL no lo permite en la misma transacción en que se agrega).
ALTER TYPE "EstadoRecibo" ADD VALUE 'CANCELADO';

ALTER TABLE "polizas" ADD COLUMN "cancelada_at" DATE;
ALTER TABLE "polizas" ADD COLUMN "motivo_cancelacion" TEXT;

CREATE TABLE "endosos" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "poliza_id" TEXT NOT NULL,
    "numero" TEXT,
    "tipo" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "prima" DECIMAL(14,2),
    "usuario_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "endosos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "endosos_poliza_id_fecha_idx" ON "endosos"("poliza_id", "fecha");
CREATE INDEX "endosos_agencia_id_idx" ON "endosos"("agencia_id");

ALTER TABLE "endosos" ADD CONSTRAINT "endosos_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "endosos" ADD CONSTRAINT "endosos_poliza_id_fkey" FOREIGN KEY ("poliza_id") REFERENCES "polizas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
ALTER TABLE "endosos" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "endosos" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "endosos";
  CREATE POLICY "misma agencia" ON "endosos" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
