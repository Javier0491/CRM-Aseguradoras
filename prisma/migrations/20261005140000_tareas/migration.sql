-- Tareas y recordatorios del equipo, opcionalmente de un cliente o una póliza.
CREATE TABLE "tareas" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "vence" DATE NOT NULL,
    "responsable_id" TEXT,
    "cliente_id" TEXT,
    "poliza_id" TEXT,
    "creada_por_email" TEXT,
    "completada_at" TIMESTAMP(3),
    "completada_por_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tareas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tareas_agencia_id_completada_at_vence_idx" ON "tareas"("agencia_id", "completada_at", "vence");
CREATE INDEX "tareas_responsable_id_completada_at_idx" ON "tareas"("responsable_id", "completada_at");
CREATE INDEX "tareas_cliente_id_idx" ON "tareas"("cliente_id");
CREATE INDEX "tareas_poliza_id_idx" ON "tareas"("poliza_id");

ALTER TABLE "tareas" ADD CONSTRAINT "tareas_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_poliza_id_fkey" FOREIGN KEY ("poliza_id") REFERENCES "polizas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
ALTER TABLE "tareas" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "tareas" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "tareas";
  CREATE POLICY "misma agencia" ON "tareas" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
