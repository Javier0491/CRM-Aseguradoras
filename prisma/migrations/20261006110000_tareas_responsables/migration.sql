-- Varios encargados por tarea: cada uno marca su parte y la tarea queda hecha cuando todos
-- terminan (el avance es cuántos ya terminaron).
CREATE TABLE "tareas_responsables" (
    "tarea_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "completada_at" TIMESTAMP(3),

    CONSTRAINT "tareas_responsables_pkey" PRIMARY KEY ("tarea_id","usuario_id")
);

CREATE INDEX "tareas_responsables_usuario_id_completada_at_idx" ON "tareas_responsables"("usuario_id", "completada_at");
CREATE INDEX "tareas_responsables_agencia_id_idx" ON "tareas_responsables"("agencia_id");

ALTER TABLE "tareas_responsables" ADD CONSTRAINT "tareas_responsables_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tareas_responsables" ADD CONSTRAINT "tareas_responsables_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tareas_responsables" ADD CONSTRAINT "tareas_responsables_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El responsable de cada tarea existente pasa a ser su único encargado, con su parte hecha si la
-- tarea ya estaba completada.
INSERT INTO "tareas_responsables" ("tarea_id", "usuario_id", "agencia_id", "completada_at")
SELECT "id", "responsable_id", "agencia_id", "completada_at"
FROM "tareas"
WHERE "responsable_id" IS NOT NULL;

DROP INDEX "tareas_responsable_id_completada_at_idx";
ALTER TABLE "tareas" DROP CONSTRAINT "tareas_responsable_id_fkey";
ALTER TABLE "tareas" DROP COLUMN "responsable_id";

-- Borrado suave: "Deshacer" recupera la tarea tal cual, con sus encargados y su avance.
ALTER TABLE "tareas" ADD COLUMN "eliminada_at" TIMESTAMP(3);

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
ALTER TABLE "tareas_responsables" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "tareas_responsables" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "tareas_responsables";
  CREATE POLICY "misma agencia" ON "tareas_responsables" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
