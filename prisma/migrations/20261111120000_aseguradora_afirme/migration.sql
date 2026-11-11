-- Agrega Afirme al catálogo de las agencias que ya tienen aseguradoras (las nuevas nacen vacías).
INSERT INTO "aseguradoras" ("id", "agencia_id", "nombre", "color_hex")
SELECT gen_random_uuid()::text, a."agencia_id", 'Afirme', '#009D29'
FROM (SELECT DISTINCT "agencia_id" FROM "aseguradoras") a
ON CONFLICT ("agencia_id", "nombre") DO NOTHING;
