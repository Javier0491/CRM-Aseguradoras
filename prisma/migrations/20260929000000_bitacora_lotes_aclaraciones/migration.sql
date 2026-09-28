-- Bitácora de auditoría, lotes de conciliación revertibles y seguimiento de aclaraciones.

-- CreateTable
CREATE TABLE "bitacora" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT,
    "usuario_email" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "descripcion" TEXT NOT NULL,
    "datos" JSONB,

    CONSTRAINT "bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_conciliacion" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aseguradora_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "usuario_email" TEXT,
    "archivo_nombre" TEXT NOT NULL,
    "renglones" INTEGER NOT NULL,
    "conciliados" INTEGER NOT NULL,
    "pagados" INTEGER NOT NULL,
    "creados" INTEGER NOT NULL,
    "revertido_at" TIMESTAMP(3),
    "revertido_por" TEXT,

    CONSTRAINT "lotes_conciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_cambios" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "recibo_id" TEXT,
    "tipo" TEXT NOT NULL,
    "fila" INTEGER NOT NULL,
    "poliza_numero" TEXT NOT NULL,
    "recibo_numero" INTEGER NOT NULL,
    "estado_anterior" "EstadoRecibo",
    "comision_anterior" DECIMAL(14,2),
    "folio_anterior" TEXT,
    "conciliado_at_anterior" TIMESTAMP(3),
    "estado_nuevo" "EstadoRecibo" NOT NULL,
    "comision_nueva" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "lotes_cambios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_aclaracion" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recibo_id" TEXT NOT NULL,
    "usuario_email" TEXT,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "monto" DECIMAL(14,2),

    CONSTRAINT "notas_aclaracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bitacora_created_at_idx" ON "bitacora"("created_at");

-- CreateIndex
CREATE INDEX "bitacora_entidad_entidad_id_idx" ON "bitacora"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "lotes_conciliacion_created_at_idx" ON "lotes_conciliacion"("created_at");

-- CreateIndex
CREATE INDEX "lotes_cambios_lote_id_idx" ON "lotes_cambios"("lote_id");

-- CreateIndex
CREATE INDEX "lotes_cambios_recibo_id_idx" ON "lotes_cambios"("recibo_id");

-- CreateIndex
CREATE INDEX "notas_aclaracion_recibo_id_created_at_idx" ON "notas_aclaracion"("recibo_id", "created_at");

-- AddForeignKey
ALTER TABLE "lotes_conciliacion" ADD CONSTRAINT "lotes_conciliacion_aseguradora_id_fkey" FOREIGN KEY ("aseguradora_id") REFERENCES "aseguradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_cambios" ADD CONSTRAINT "lotes_cambios_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_conciliacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_cambios" ADD CONSTRAINT "lotes_cambios_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "recibos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_aclaracion" ADD CONSTRAINT "notas_aclaracion_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "recibos"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Solo la aplicación (dueña de las tablas) las usa: nada de acceso por la API REST de Supabase.
-- En particular, nadie debe poder borrar o alterar la bitácora con su propio token.
ALTER TABLE "bitacora" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes_conciliacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes_cambios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notas_aclaracion" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  rol text;
  tabla text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tabla IN ARRAY ARRAY['bitacora', 'lotes_conciliacion', 'lotes_cambios', 'notas_aclaracion'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tabla, rol);
      END LOOP;
    END IF;
  END LOOP;
END $$;
