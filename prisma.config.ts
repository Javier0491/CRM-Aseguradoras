import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// En Prisma 7 la URL del datasource ya no se declara en schema.prisma.
// El CLI (migrate, seed, studio) usa la conexión directa/sesión (DIRECT_URL),
// mientras que la aplicación se conecta por el pooler (DATABASE_URL) en lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
