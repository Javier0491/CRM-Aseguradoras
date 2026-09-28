-- Conciliación con auto-creación: el estado de cuenta es la fuente de la verdad de lo cobrado.
-- folio: identificador del recibo en la aseguradora (único por póliza; NULL se permite repetido).
-- auto_creado: el recibo lo creó la conciliación porque no existía en el CRM.
-- AlterTable
ALTER TABLE "recibos" ADD COLUMN     "auto_creado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "folio" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "recibos_poliza_id_folio_key" ON "recibos"("poliza_id", "folio");
