-- Expediente del cliente: tipo de persona, fecha de nacimiento, dirección y seguimiento (notas).
CREATE TYPE "TipoPersona" AS ENUM ('FISICA', 'MORAL');

ALTER TABLE "clientes" ADD COLUMN "tipo_persona" "TipoPersona" NOT NULL DEFAULT 'FISICA';
ALTER TABLE "clientes" ADD COLUMN "fecha_nacimiento" DATE;
ALTER TABLE "clientes" ADD COLUMN "direccion" TEXT;
ALTER TABLE "clientes" ADD COLUMN "municipio" TEXT;
ALTER TABLE "clientes" ADD COLUMN "estado" TEXT;
ALTER TABLE "clientes" ADD COLUMN "codigo_postal" TEXT;

-- El RFC de una persona moral tiene 12 caracteres (13 el de una física).
UPDATE "clientes" SET "tipo_persona" = 'MORAL'
WHERE length(regexp_replace("rfc", '[\s-]', '', 'g')) = 12;

CREATE TABLE "notas_cliente" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "poliza_id" TEXT,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "usuario_id" TEXT,
    "usuario_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_cliente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notas_cliente_cliente_id_created_at_idx" ON "notas_cliente"("cliente_id", "created_at");
CREATE INDEX "notas_cliente_agencia_id_idx" ON "notas_cliente"("agencia_id");

ALTER TABLE "notas_cliente" ADD CONSTRAINT "notas_cliente_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_cliente" ADD CONSTRAINT "notas_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notas_cliente" ADD CONSTRAINT "notas_cliente_poliza_id_fkey" FOREIGN KEY ("poliza_id") REFERENCES "polizas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
ALTER TABLE "notas_cliente" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "notas_cliente" FROM %I', rol);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "misma agencia" ON "notas_cliente";
  CREATE POLICY "misma agencia" ON "notas_cliente" FOR ALL TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()))
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
