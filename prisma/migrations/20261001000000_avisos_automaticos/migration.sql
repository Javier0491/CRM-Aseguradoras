-- Avisos automáticos por correo (Configuración → Avisos automáticos).
-- Buzón de la agencia que recibe copia de cada aviso.
ALTER TABLE "agencias" ADD COLUMN "correo_copia_avisos" TEXT;

-- Matriz por aseguradora: días de cada aviso; NULL = no se envía.
ALTER TABLE "aseguradoras" ADD COLUMN "aviso_dias_antes" INTEGER;
ALTER TABLE "aseguradoras" ADD COLUMN "aviso_dias_vencido" INTEGER;
ALTER TABLE "aseguradoras" ADD COLUMN "aviso_dias_renovacion" INTEGER;

-- Avisos ya enviados: evita mandar dos veces el mismo aviso del mismo recibo o póliza.
CREATE TABLE "avisos_enviados" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "referencia_id" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,

    CONSTRAINT "avisos_enviados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "avisos_enviados_tipo_referencia_id_key" ON "avisos_enviados"("tipo", "referencia_id");
CREATE INDEX "avisos_enviados_agencia_id_created_at_idx" ON "avisos_enviados"("agencia_id", "created_at");

ALTER TABLE "avisos_enviados" ADD CONSTRAINT "avisos_enviados_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
ALTER TABLE "avisos_enviados" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "avisos_enviados" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "avisos_enviados";
  CREATE POLICY "misma agencia" ON "avisos_enviados" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
