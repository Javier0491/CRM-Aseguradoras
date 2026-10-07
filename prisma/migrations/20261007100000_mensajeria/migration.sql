-- Mensajería interna del equipo: el canal de toda la agencia y las conversaciones directas,
-- sus mensajes y hasta dónde leyó cada quien.
CREATE TABLE "conversaciones" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "usuario_a_id" TEXT,
    "usuario_b_id" TEXT,
    "ultimo_mensaje_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mensajes" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "conversacion_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_at" TIMESTAMP(3),

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversaciones_lecturas" (
    "conversacion_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "leido_hasta" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversaciones_lecturas_pkey" PRIMARY KEY ("conversacion_id","usuario_id")
);

CREATE INDEX "conversaciones_usuario_a_id_idx" ON "conversaciones"("usuario_a_id");
CREATE INDEX "conversaciones_usuario_b_id_idx" ON "conversaciones"("usuario_b_id");
CREATE UNIQUE INDEX "conversaciones_agencia_id_clave_key" ON "conversaciones"("agencia_id", "clave");
CREATE INDEX "mensajes_conversacion_id_created_at_idx" ON "mensajes"("conversacion_id", "created_at");
CREATE INDEX "mensajes_agencia_id_idx" ON "mensajes"("agencia_id");
CREATE INDEX "conversaciones_lecturas_usuario_id_idx" ON "conversaciones_lecturas"("usuario_id");
CREATE INDEX "conversaciones_lecturas_agencia_id_idx" ON "conversaciones_lecturas"("agencia_id");

ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_usuario_a_id_fkey" FOREIGN KEY ("usuario_a_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_usuario_b_id_fkey" FOREIGN KEY ("usuario_b_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversaciones_lecturas" ADD CONSTRAINT "conversaciones_lecturas_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversaciones_lecturas" ADD CONSTRAINT "conversaciones_lecturas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversaciones_lecturas" ADD CONSTRAINT "conversaciones_lecturas_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mismo aislamiento por agencia que el resto de las tablas (ver 20260929300000_rls_por_agencia).
-- El CRM lee y escribe desde el servidor; nada de esto se expone a anon ni a authenticated.
ALTER TABLE "conversaciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mensajes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversaciones_lecturas" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tabla text;
  rol text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['conversaciones', 'mensajes', 'conversaciones_lecturas'] LOOP
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tabla, rol);
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('DROP POLICY IF EXISTS "misma agencia" ON %I', tabla);
      EXECUTE format(
        'CREATE POLICY "misma agencia" ON %I FOR ALL TO authenticated '
        'USING (agencia_id = (SELECT public.agencia_actual())) '
        'WITH CHECK (agencia_id = (SELECT public.agencia_actual()))',
        tabla
      );
    END IF;
  END LOOP;
END $$;
