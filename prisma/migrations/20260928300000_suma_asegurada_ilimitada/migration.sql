-- Suma asegurada "Sin límite" (SIN/LIMITE, Ilimitada, S/L, Amparada…). La cantidad vive en
-- datos_ramo (JSON) y ya es opcional ahí: con la bandera activa simplemente no se guarda.
-- AlterTable
ALTER TABLE "polizas" ADD COLUMN     "suma_asegurada_ilimitada" BOOLEAN NOT NULL DEFAULT false;
