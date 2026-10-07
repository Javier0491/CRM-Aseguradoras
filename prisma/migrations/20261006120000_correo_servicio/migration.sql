-- Correo de atención a clientes de cada agencia (Configuración → Mi agencia): va en los correos
-- masivos y en el agradecimiento por renovar, y es a donde responden los clientes.
ALTER TABLE "agencias" ADD COLUMN "correo_servicio" TEXT;

-- PJ MAGNUS (agencia inicial, id fijo): servicio@magnusseguros.com, pedido el 2026-10-06.
UPDATE "agencias"
SET "correo_servicio" = 'servicio@magnusseguros.com'
WHERE "id" = '00000000-0000-4000-8000-000000000001' AND "correo_servicio" IS NULL;
