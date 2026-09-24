-- Amplía el catálogo de ramos de 4 a 7.
-- Se renombran los valores existentes en lugar de recrear el enum para conservar
-- las pólizas ya registradas: VIDA pasa a VIDA_INDIVIDUAL y EMPRESARIAL a DANOS.
ALTER TYPE "Ramo" RENAME VALUE 'VIDA' TO 'VIDA_INDIVIDUAL';
ALTER TYPE "Ramo" RENAME VALUE 'EMPRESARIAL' TO 'DANOS';

ALTER TYPE "Ramo" ADD VALUE 'VIDA_GRUPO' AFTER 'VIDA_INDIVIDUAL';
ALTER TYPE "Ramo" ADD VALUE 'HOGAR' AFTER 'DANOS';
ALTER TYPE "Ramo" ADD VALUE 'OTROS' AFTER 'HOGAR';
