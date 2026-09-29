-- Aislamiento por agencia: el código ya pasa agencia_id explícitamente en todas las escrituras,
-- así que se quita el DEFAULT temporal a la agencia inicial. Un INSERT sin agencia ahora falla
-- en lugar de caer silenciosamente en "PJ MAGNUS".
ALTER TABLE "usuarios" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "clientes" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "aseguradoras" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "polizas" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "recibos" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "asegurados" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "esquemas_comision" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "bitacora" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "lotes_conciliacion" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "lotes_cambios" ALTER COLUMN "agencia_id" DROP DEFAULT;
ALTER TABLE "notas_aclaracion" ALTER COLUMN "agencia_id" DROP DEFAULT;
