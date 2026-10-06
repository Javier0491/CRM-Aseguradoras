-- Registro de las tareas programadas: el panel del SUPERADMIN avisa si la última falló o si
-- dejó de correr.
CREATE TABLE "ejecuciones_cron" (
    "id" TEXT NOT NULL,
    "tarea" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "ok" BOOLEAN,
    "resumen" JSONB,
    "error" TEXT,

    CONSTRAINT "ejecuciones_cron_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ejecuciones_cron_tarea_inicio_idx" ON "ejecuciones_cron"("tarea", "inicio");

-- Tabla de la plataforma: sin acceso por la API REST (ver 20260929300000_rls_por_agencia).
ALTER TABLE "ejecuciones_cron" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "ejecuciones_cron" FROM %I', rol);
    END IF;
  END LOOP;
END $$;
