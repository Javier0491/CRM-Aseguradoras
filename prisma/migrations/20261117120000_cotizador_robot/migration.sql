-- Robot cotizador: solicitudes de cotización de auto que resuelve la computadora de la oficina
-- manejando el portal de la aseguradora, y la llave con la que se identifica ante el CRM.

CREATE TYPE "EstadoCotizacion" AS ENUM ('PENDIENTE', 'COTIZANDO', 'LISTA', 'ERROR', 'CANCELADA');

ALTER TABLE "agencias" ADD COLUMN "cotizador_token_hash" TEXT;
ALTER TABLE "agencias" ADD COLUMN "cotizador_visto_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "agencias_cotizador_token_hash_key" ON "agencias"("cotizador_token_hash");

CREATE TABLE "solicitudes_cotizacion" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "aseguradora" TEXT NOT NULL,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'PENDIENTE',
    "datos" JSONB NOT NULL,
    "resultado" JSONB,
    "error" TEXT,
    "creado_por_id" TEXT,
    "tomada_at" TIMESTAMP(3),
    "terminada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_cotizacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitudes_cotizacion_agencia_id_estado_created_at_idx" ON "solicitudes_cotizacion"("agencia_id", "estado", "created_at");
CREATE INDEX "solicitudes_cotizacion_creado_por_id_idx" ON "solicitudes_cotizacion"("creado_por_id");

ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
ALTER TABLE "solicitudes_cotizacion" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "solicitudes_cotizacion" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "solicitudes_cotizacion";
  CREATE POLICY "misma agencia" ON "solicitudes_cotizacion" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
