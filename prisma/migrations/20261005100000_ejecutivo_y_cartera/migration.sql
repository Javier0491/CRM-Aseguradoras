-- Ejecutivo responsable de cada cliente y póliza, y la opción de que cada ejecutivo vea solo su
-- cartera (Configuración → Mi agencia).
ALTER TABLE "agencias" ADD COLUMN "cartera_por_ejecutivo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "clientes" ADD COLUMN "ejecutivo_id" TEXT;
ALTER TABLE "polizas" ADD COLUMN "ejecutivo_id" TEXT;

CREATE INDEX "clientes_ejecutivo_id_idx" ON "clientes"("ejecutivo_id");
CREATE INDEX "polizas_ejecutivo_id_idx" ON "polizas"("ejecutivo_id");

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_ejecutivo_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_ejecutivo_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Asignación inicial: cada póliza a quien la capturó o renovó (según la bitácora), si es una
-- cuenta de la misma agencia y no un SUPERADMIN. Cada cliente, al ejecutivo de su póliza más
-- reciente. Lo que no se pueda deducir queda sin asignar y se asigna desde la aplicación.
UPDATE "polizas" p
SET "ejecutivo_id" = b."usuario_id"
FROM (
  SELECT DISTINCT ON (bt."entidad_id") bt."entidad_id", bt."usuario_id", bt."agencia_id"
  FROM "bitacora" bt
  JOIN "usuarios" u ON u."id" = bt."usuario_id"
  WHERE bt."entidad" = 'poliza'
    AND bt."accion" IN ('poliza.crear', 'poliza.renovar')
    AND u."rol_sistema" = 'USER'
    AND u."agencia_id" = bt."agencia_id"
  ORDER BY bt."entidad_id", bt."created_at"
) b
WHERE p."id" = b."entidad_id" AND p."agencia_id" = b."agencia_id";

UPDATE "clientes" c
SET "ejecutivo_id" = x."ejecutivo_id"
FROM (
  SELECT DISTINCT ON ("cliente_id") "cliente_id", "ejecutivo_id"
  FROM "polizas"
  WHERE "ejecutivo_id" IS NOT NULL
  ORDER BY "cliente_id", "vigencia_inicio" DESC
) x
WHERE c."id" = x."cliente_id";
