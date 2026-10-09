import type { MetadataRoute } from "next";

import { SITIO } from "@/lib/sitio";

// Debe seguir en RUTAS_PUBLICAS de proxy.ts: los buscadores no tienen sesión.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/dashboard", "/superadmin", "/dev", "/api/"],
    },
    sitemap: `${SITIO}/sitemap.xml`,
    host: SITIO,
  };
}
