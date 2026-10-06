-- Cobranza de la plataforma (SUPERADMIN): cuota mensual de cada agencia, hasta cuándo está
-- pagada, avisos de cobro y suspensión automática por falta de pago.
ALTER TABLE "agencias" ADD COLUMN "cuota_mensual" DECIMAL(12,2);
ALTER TABLE "agencias" ADD COLUMN "pagado_hasta" DATE;
ALTER TABLE "agencias" ADD COLUMN "dias_tolerancia_pago" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "agencias" ADD COLUMN "suspension_automatica" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agencias" ADD COLUMN "aviso_cobro_enviado_para" DATE;
ALTER TABLE "agencias" ADD COLUMN "correo_facturacion" TEXT;

ALTER TABLE "agencias" ADD CONSTRAINT "agencias_dias_tolerancia_pago_check"
  CHECK ("dias_tolerancia_pago" BETWEEN 0 AND 60);
ALTER TABLE "agencias" ADD CONSTRAINT "agencias_cuota_mensual_check"
  CHECK ("cuota_mensual" IS NULL OR "cuota_mensual" >= 0);

CREATE TABLE "pagos_plataforma" (
    "id" TEXT NOT NULL,
    "agencia_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "cubre_hasta" DATE NOT NULL,
    "nota" TEXT,
    "registrado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pagos_plataforma_agencia_id_fecha_idx" ON "pagos_plataforma"("agencia_id", "fecha");

ALTER TABLE "pagos_plataforma" ADD CONSTRAINT "pagos_plataforma_agencia_id_fkey" FOREIGN KEY ("agencia_id") REFERENCES "agencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tabla de la plataforma: ni las agencias ni la API REST la leen (solo la aplicación, dueña de
-- las tablas). RLS activo y sin políticas.
ALTER TABLE "pagos_plataforma" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE "pagos_plataforma" FROM %I', rol);
    END IF;
  END LOOP;
END $$;
