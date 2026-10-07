import type { MetadataRoute } from "next";

const SITIO = "https://crm-aseguradoras-eight.vercel.app";

// Todo el CRM requiere sesión (proxy.ts); la única URL pública de entrada es la raíz.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITIO, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
