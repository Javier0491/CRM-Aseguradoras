-- Renglones de estados de cuenta que la conciliación no pudo aplicar (Pólizas → Sin conciliar).
CREATE TABLE "lotes_renglones" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "lote_id" TEXT NOT NULL,
    "fila" INTEGER NOT NULL,
    "poliza_archivo" TEXT NOT NULL,
    "estatus" TEXT NOT NULL,
    "detalle" TEXT,
    "comision_pagada" DECIMAL(14,2) NOT NULL,
    "folio" TEXT,
    "poliza_id" TEXT,

    CONSTRAINT "lotes_renglones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lotes_renglones_lote_id_idx" ON "lotes_renglones"("lote_id");
CREATE INDEX "lotes_renglones_poliza_id_idx" ON "lotes_renglones"("poliza_id");
CREATE INDEX "lotes_renglones_agencia_id_idx" ON "lotes_renglones"("agencia_id");

ALTER TABLE "lotes_renglones" ADD CONSTRAINT "lotes_renglones_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lotes_renglones" ADD CONSTRAINT "lotes_renglones_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_conciliacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lotes_renglones" ADD CONSTRAINT "lotes_renglones_poliza_id_fkey" FOREIGN KEY ("poliza_id") REFERENCES "polizas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
ALTER TABLE "lotes_renglones" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "lotes_renglones" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "lotes_renglones";
  CREATE POLICY "misma agencia" ON "lotes_renglones" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
