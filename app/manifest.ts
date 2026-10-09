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
    // Monograma platino sobre ficha oscura; el "maskable" deja el logo en la zona segura para que
    // Android pueda recortarlo en círculo o en gota.
    icons: [
      { src: "/marca/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/marca/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
