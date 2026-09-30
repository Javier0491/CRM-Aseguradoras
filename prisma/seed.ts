import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { AGENCIA_INICIAL_ID } from "../lib/agencias/constantes";
import { PrismaClient } from "../lib/generated/prisma/client";

// El seed corre desde el CLI, así que usa la conexión de sesión (DIRECT_URL).
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Define DIRECT_URL o DATABASE_URL en .env");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Colores corporativos principales de cada marca.
const aseguradoras = [
  { nombre: "GNP", color_hex: "#F26522" },
  // Cobra por el número de póliza completo y su estado de cuenta repite renglones.
  { nombre: "Quálitas", color_hex: "#6D2077", usaPolizaVigor: false, ignoraRecibosDuplicados: true },
  { nombre: "MetLife", color_hex: "#0090DA" },
  { nombre: "AXA", color_hex: "#00008F" },
  { nombre: "Mapfre", color_hex: "#D81E05" },
  { nombre: "HDI", color_hex: "#006B3F" },
  { nombre: "Seguros Monterrey", color_hex: "#00529B" },
  { nombre: "Zurich", color_hex: "#2167AE" },
  // Chubb es negro en su marca; se usa gris para que se distinga sobre el fondo oscuro.
  { nombre: "Chubb", color_hex: "#8C8C8C" },
  { nombre: "ABA Seguros", color_hex: "#003DA5" },
  // Gastos Médicos (catálogo de redes médicas, lib/polizas/redes-medicas.ts).
  // Colores aproximados de cada marca; ajústalos si no coinciden.
  { nombre: "Plan Seguro", color_hex: "#0B5CAB" },
  { nombre: "BX+", color_hex: "#E4002B" },
  { nombre: "Bupa", color_hex: "#0079C8" },
];

// Matriz de comisiones INICIAL de ejemplo: ajústala a los contratos reales de la promotoría.
// Un solo renglón de año 1 funciona como porcentaje fijo para todos los años.
const esquemasComision: {
  aseguradora: string;
  ramo: "AUTOS" | "GMM_INDIVIDUAL" | "GMM_COLECTIVO" | "VIDA_INDIVIDUAL";
  anio: number;
  porcentaje: number;
}[] = [
  { aseguradora: "MetLife", ramo: "VIDA_INDIVIDUAL", anio: 1, porcentaje: 45 },
  { aseguradora: "MetLife", ramo: "VIDA_INDIVIDUAL", anio: 2, porcentaje: 10 },
  { aseguradora: "MetLife", ramo: "GMM_COLECTIVO", anio: 1, porcentaje: 8 },
  { aseguradora: "Quálitas", ramo: "AUTOS", anio: 1, porcentaje: 12 },
  { aseguradora: "GNP", ramo: "AUTOS", anio: 1, porcentaje: 12 },
  { aseguradora: "GNP", ramo: "GMM_INDIVIDUAL", anio: 1, porcentaje: 15 },
];

async function main() {
  // El catálogo y la matriz de ejemplo son de la agencia inicial (la crea la migración).
  const agenciaId = AGENCIA_INICIAL_ID;
  // Upsert por nombre (único dentro de la agencia): el seed es idempotente y puede ejecutarse varias veces.
  // En las existentes solo se actualiza el color: no se toca el estado de su integración.
  for (const a of aseguradoras) {
    await db.aseguradora.upsert({
      where: { agenciaId_nombre: { agenciaId, nombre: a.nombre } },
      update: { color_hex: a.color_hex },
      create: { ...a, agenciaId, estado_api: "INACTIVA" },
    });
  }
  // Solo se crean los porcentajes que faltan: nunca se sobrescribe uno ya ajustado.
  let creados = 0;
  for (const e of esquemasComision) {
    const aseguradora = await db.aseguradora.findUniqueOrThrow({
      where: { agenciaId_nombre: { agenciaId, nombre: e.aseguradora } },
    });
    const clave = { aseguradora_id: aseguradora.id, ramo: e.ramo, anio_poliza: e.anio };
    // Las reglas del seed aplican a todas las edades.
    const existe = await db.esquemaComision.findFirst({
      where: { ...clave, edad_minima: null, edad_maxima: null },
      select: { id: true },
    });
    if (!existe) {
      await db.esquemaComision.create({ data: { ...clave, agenciaId, porcentaje: e.porcentaje } });
      creados++;
    }
  }
  console.log(
    `Seed completado: ${aseguradoras.length} aseguradoras, ${creados} esquemas de comisión nuevos ` +
      `(${esquemasComision.length - creados} ya existían).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
