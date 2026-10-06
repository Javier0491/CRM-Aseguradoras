-- Liga de acceso con la marca de cada agencia: /login?agencia=<slug>.
ALTER TABLE "agencias" ADD COLUMN "slug" TEXT;

-- Slug inicial a partir del nombre: minúsculas, sin acentos y con guiones ("Seguros Ruiz" →
-- "seguros-ruiz"). Si dos nombres dan el mismo, el segundo lleva "-2", el tercero "-3"…
UPDATE "agencias" a
SET "slug" = s."slug"
FROM (
  SELECT "id", CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS "slug"
  FROM (
    SELECT "id", base, row_number() OVER (PARTITION BY base ORDER BY "created_at", "id") AS rn
    FROM (
      SELECT
        "id",
        "created_at",
        coalesce(
          nullif(
            left(
              trim(BOTH '-' FROM regexp_replace(
                translate(lower("nombre"), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
                '[^a-z0-9]+', '-', 'g'
              )),
              40
            ),
            ''
          ),
          'agencia'
        ) AS base
      FROM "agencias"
    ) b
  ) r
) s
WHERE a."id" = s."id";

-- left() pudo dejar un guion al final.
UPDATE "agencias" SET "slug" = rtrim("slug", '-') WHERE "slug" LIKE '%-';

ALTER TABLE "agencias" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "agencias_slug_key" ON "agencias"("slug");
ALTER TABLE "agencias" ADD CONSTRAINT "agencias_slug_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") BETWEEN 2 AND 60);
