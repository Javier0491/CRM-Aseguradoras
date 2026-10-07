-- Renovaciones: el número original se conserva y la póliza vigor (clave de cobranza) cambia en
-- cada renovación. La liga entre una póliza y sus renovaciones deja de deducirse de la vigor y
-- se guarda en cadena_id: el id de la primera póliza de la cadena.
ALTER TABLE "polizas" ADD COLUMN "cadena_id" TEXT;

-- Las pólizas que ya existen: su cadena es la que antes se deducía (misma agencia, aseguradora y
-- póliza vigor); la primera vigencia es la raíz. Sin vigor, cada póliza es su propia cadena.
UPDATE "polizas" p
SET "cadena_id" = COALESCE(
  (
    SELECT q."id"
    FROM "polizas" q
    WHERE q."agencia_id" = p."agencia_id"
      AND q."aseguradora_id" = p."aseguradora_id"
      AND q."numero_poliza_vigor" = p."numero_poliza_vigor"
    ORDER BY q."vigencia_inicio" ASC, q."created_at" ASC, q."id" ASC
    LIMIT 1
  ),
  p."id"
);

ALTER TABLE "polizas" ALTER COLUMN "cadena_id" SET NOT NULL;
CREATE INDEX "polizas_cadena_id_idx" ON "polizas"("cadena_id");

-- Las renovaciones repiten el número original: lo repetido es el mismo número con la misma vigencia.
DROP INDEX "polizas_agencia_id_numero_poliza_original_key";
CREATE UNIQUE INDEX "polizas_agencia_id_numero_poliza_original_vigencia_inicio_key"
  ON "polizas"("agencia_id", "numero_poliza_original", "vigencia_inicio");
