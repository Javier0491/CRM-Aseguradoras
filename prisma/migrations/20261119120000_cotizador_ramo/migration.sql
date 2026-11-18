-- Multicotizador: cada solicitud dice de qué ramo es (autos, gastos médicos…). Las existentes son de autos.
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "ramo" TEXT NOT NULL DEFAULT 'AUTOS';

CREATE INDEX "solicitudes_cotizacion_agencia_id_ramo_created_at_idx" ON "solicitudes_cotizacion"("agencia_id", "ramo", "created_at");
