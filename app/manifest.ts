import type { MetadataRoute } from "next";

/**
 * Manifiesto web: permite instalar el CRM como app (en iPhone es requisito para recibir
 * notificaciones push: Compartir → Agregar a inicio).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM de seguros",
    short_name: "CRM",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [{ src: "/marca/plataforma.png", sizes: "256x256", type: "image/png" }],
  };
}
