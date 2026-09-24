import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";

// El seed corre desde el CLI, así que usa la conexión de sesión (DIRECT_URL).
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Define DIRECT_URL o DATABASE_URL en .env");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Colores corporativos principales de cada marca.
const aseguradoras = [
  { nombre: "GNP", color_hex: "#F26522" },
  { nombre: "Quálitas", color_hex: "#6D2077" },
  { nombre: "MetLife", color_hex: "#0090DA" },
  { nombre: "AXA", color_hex: "#00008F" },
  { nombre: "Mapfre", color_hex: "#D81E05" },
  { nombre: "HDI", color_hex: "#006B3F" },
  { nombre: "Seguros Monterrey", color_hex: "#00529B" },
  { nombre: "Zurich", color_hex: "#2167AE" },
  // Chubb es negro en su marca; se usa gris para que se distinga sobre el fondo oscuro.
  { nombre: "Chubb", color_hex: "#8C8C8C" },
  { nombre: "ABA Seguros", color_hex: "#003DA5" },
];

async function main() {
  // Upsert por nombre (único): el seed es idempotente y puede ejecutarse varias veces.
  for (const a of aseguradoras) {
    await db.aseguradora.upsert({
      where: { nombre: a.nombre },
      update: { color_hex: a.color_hex, estado_api: "INACTIVA" },
      create: { ...a, estado_api: "INACTIVA" },
    });
  }
  console.log(`Seed completado: ${aseguradoras.length} aseguradoras.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
