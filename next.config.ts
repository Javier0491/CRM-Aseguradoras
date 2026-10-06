import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // La captura inteligente envía varios documentos juntos (hasta 25 MB, ver
    // OCR_MAX_BYTES_TOTAL) y el proxy solo almacena 10 MB del cuerpo por omisión.
    proxyClientMaxBodySize: "26mb",
  },
  // El panel de la plataforma compara las migraciones del código con las aplicadas en la base de
  // datos (lib/plataforma/migraciones.ts): la carpeta debe viajar en el despliegue.
  outputFileTracingIncludes: {
    "/superadmin": ["./prisma/migrations/**/*.sql"],
    "/superadmin/diagnostico": ["./prisma/migrations/**/*.sql"],
    "/api/sistema/estado": ["./prisma/migrations/**/*.sql"],
  },
};

export default nextConfig;
