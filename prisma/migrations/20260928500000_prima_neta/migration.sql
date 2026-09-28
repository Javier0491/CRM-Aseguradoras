-- Prima neta (sin IVA, recargos ni derecho de póliza): base de la comisión esperada.
-- Nullable: las pólizas capturadas antes no la tienen y se completan desde su detalle.
-- AlterTable
ALTER TABLE "polizas" ADD COLUMN     "prima_neta" DECIMAL(14,2);
