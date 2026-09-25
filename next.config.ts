import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // La captura inteligente envía varios documentos juntos (hasta 25 MB, ver
    // OCR_MAX_BYTES_TOTAL) y el proxy solo almacena 10 MB del cuerpo por omisión.
    proxyClientMaxBodySize: "26mb",
  },
};

export default nextConfig;
