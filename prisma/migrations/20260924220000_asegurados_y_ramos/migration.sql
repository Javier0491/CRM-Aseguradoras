-- Ramos: Gastos Médicos se divide en GMM Individual y GMM Colectivo, y se agrega
-- RC Profesional. Se renombra el valor existente en lugar de recrear el enum para
-- conservar las pólizas registradas: GASTOS_MEDICOS pasa a GMM_INDIVIDUAL.
ALTER TYPE "Ramo" RENAME VALUE 'GASTOS_MEDICOS' TO 'GMM_INDIVIDUAL';
ALTER TYPE "Ramo" ADD VALUE 'GMM_COLECTIVO' AFTER 'GMM_INDIVIDUAL';
ALTER TYPE "Ramo" ADD VALUE 'RC_PROFESIONAL' AFTER 'DANOS';

-- Asegurados de cada póliza.
CREATE TABLE "asegurados" (
    "id" TEXT NOT NULL,
    "poliza_id" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "parentesco" TEXT NOT NULL,
    "edad" INTEGER,
    "sexo" TEXT,
    "fecha_nacimiento" TEXT,
    "antiguedad" TEXT,

    CONSTRAINT "asegurados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asegurados_poliza_id_idx" ON "asegurados"("poliza_id");

ALTER TABLE "asegurados" ADD CONSTRAINT "asegurados_poliza_id_fkey" FOREIGN KEY ("poliza_id") REFERENCES "polizas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
