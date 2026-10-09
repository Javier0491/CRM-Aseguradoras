// URL pública del sitio para SEO: metadataBase, canonical, robots.txt y sitemap.xml. Al conectar
// el dominio propio basta con definir URL_SITIO (p. ej. https://www.zensecure.com) en Vercel.
export const SITIO = (process.env.URL_SITIO?.trim() || "https://crm-aseguradoras-eight.vercel.app").replace(/\/+$/, "");

/** Tarjeta de 1200 × 630 para compartir el enlace (WhatsApp, LinkedIn, X). */
export const IMAGEN_COMPARTIR = {
  url: "/marca/zensecure-og.png",
  width: 1200,
  height: 630,
  alt: "ZenSecure by Atelier Zenith · CRM con IA para Brokers y Agentes de seguros",
};
