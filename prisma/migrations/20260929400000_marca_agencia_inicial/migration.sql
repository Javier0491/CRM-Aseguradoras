-- White-label: el sidebar y el color de marca ya salen de la agencia, no del código. La agencia
-- inicial conserva su identidad actual: el monograma de public/logo-pj-icono.png y el dorado.
-- Solo si no se han personalizado ya (desde Configuración → Mi agencia).
UPDATE "agencias"
SET "logo_url" = COALESCE("logo_url", '/logo-pj-icono.png'),
    "color_hex" = COALESCE("color_hex", '#C5A059'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-4000-8000-000000000001'
  AND ("logo_url" IS NULL OR "color_hex" IS NULL);
