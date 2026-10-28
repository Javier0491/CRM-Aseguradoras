-- Forma de pago de tres recibos al año (p. ej. ANA Seguros en Autos).
ALTER TYPE "FormaPago" ADD VALUE IF NOT EXISTS 'CUATRIMESTRAL' BEFORE 'TRIMESTRAL';

-- Agrega Seguros Atlas, ANA Seguros e Insignia Life al catálogo de las agencias que ya tienen
-- aseguradoras (las nuevas nacen vacías).
INSERT INTO "aseguradoras" ("id", "agencia_id", "nombre", "color_hex")
SELECT gen_random_uuid()::text, a."agencia_id", n."nombre", n."color_hex"
FROM (SELECT DISTINCT "agencia_id" FROM "aseguradoras") a
CROSS JOIN (VALUES ('Seguros Atlas', '#E4352A'), ('ANA Seguros', '#0057A8'), ('Insignia Life', '#6B2C91')) AS n("nombre", "color_hex")
ON CONFLICT ("agencia_id", "nombre") DO NOTHING;
