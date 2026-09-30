-- Reglas de cobranza por aseguradora (se editan en Aseguradoras → Reglas de cobranza).
ALTER TABLE "aseguradoras"
  ADD COLUMN "usa_poliza_vigor" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ignora_recibos_duplicados" BOOLEAN NOT NULL DEFAULT false;

-- Quálitas (en todas las agencias): cobra por el número de póliza completo y su estado de
-- cuenta repite renglones del mismo recibo.
UPDATE "aseguradoras"
SET "usa_poliza_vigor" = false,
    "ignora_recibos_duplicados" = true
WHERE upper(translate("nombre", 'áÁ', 'aA')) LIKE 'QUALITAS%';
