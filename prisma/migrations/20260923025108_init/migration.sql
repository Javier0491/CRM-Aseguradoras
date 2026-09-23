-- CreateEnum
CREATE TYPE "Ramo" AS ENUM ('AUTOS', 'GASTOS_MEDICOS', 'VIDA', 'EMPRESARIAL');

-- CreateEnum
CREATE TYPE "EstadoRecibo" AS ENUM ('PENDIENTE', 'PAGADO', 'CONCILIADO');

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aseguradoras" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color_hex" TEXT NOT NULL,
    "url_portal_cobranza" TEXT,
    "notas_acceso" TEXT,
    "api_key" TEXT,
    "api_secret" TEXT,
    "api_endpoint" TEXT,
    "estado_api" TEXT NOT NULL DEFAULT 'INACTIVA',

    CONSTRAINT "aseguradoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polizas" (
    "id" TEXT NOT NULL,
    "numero_poliza_original" TEXT NOT NULL,
    "numero_poliza_vigor" TEXT,
    "ramo" "Ramo" NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "aseguradora_id" TEXT NOT NULL,

    CONSTRAINT "polizas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recibos" (
    "id" TEXT NOT NULL,
    "poliza_id" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "estado" "EstadoRecibo" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "recibos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientes_rfc_idx" ON "clientes"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "aseguradoras_nombre_key" ON "aseguradoras"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "polizas_numero_poliza_original_key" ON "polizas"("numero_poliza_original");

-- CreateIndex
CREATE UNIQUE INDEX "polizas_numero_poliza_vigor_key" ON "polizas"("numero_poliza_vigor");

-- CreateIndex
CREATE INDEX "polizas_cliente_id_idx" ON "polizas"("cliente_id");

-- CreateIndex
CREATE INDEX "polizas_aseguradora_id_idx" ON "polizas"("aseguradora_id");

-- CreateIndex
CREATE INDEX "recibos_poliza_id_idx" ON "recibos"("poliza_id");

-- CreateIndex
CREATE INDEX "recibos_estado_fecha_vencimiento_idx" ON "recibos"("estado", "fecha_vencimiento");

-- AddForeignKey
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_aseguradora_id_fkey" FOREIGN KEY ("aseguradora_id") REFERENCES "aseguradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_poliza_id_fkey" FOREIGN KEY ("poliza_id") REFERENCES "polizas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
