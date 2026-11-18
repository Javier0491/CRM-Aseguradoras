-- Multicotizador: las solicitudes de un mismo envío (una por aseguradora) comparten grupo.
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "grupo_id" UUID;

CREATE INDEX "solicitudes_cotizacion_agencia_id_grupo_id_idx" ON "solicitudes_cotizacion"("agencia_id", "grupo_id");
