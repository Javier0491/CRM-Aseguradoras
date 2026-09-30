-- Días de gracia para pagar un recibo vencido (Aseguradoras → Reglas de cobranza).
ALTER TABLE "aseguradoras" ADD COLUMN "dias_gracia" INTEGER NOT NULL DEFAULT 0;

-- MetLife (en todas las agencias) da 30 días de gracia; el resto queda en 0 hasta configurarlo.
UPDATE "aseguradoras" SET "dias_gracia" = 30 WHERE upper("nombre") LIKE 'METLIFE%';
