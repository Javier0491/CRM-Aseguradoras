// Identidad visual (white-label) de cada agencia: color de marca y logo.

/** Color de marca cuando la agencia no ha elegido uno (el dorado original del CRM). */
export const COLOR_MARCA_PREDETERMINADO = "#C5A059";

/** Fondo de la interfaz (modo oscuro); se usa para advertir colores con poco contraste. */
export const FONDO_INTERFAZ = "#0A0A0A";

/** Bucket público de Supabase Storage con los logos: {agenciaId}/logo-{uuid}.{ext}. */
export const LOGOS_BUCKET = "marcas";

export const LOGO_MAX_BYTES = 512 * 1024;

/** Formatos aceptados y su firma (primeros bytes). SVG no: podría llevar scripts. */
export const LOGO_FORMATOS = {
  "image/png": { extension: "png", firma: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { extension: "jpg", firma: [0xff, 0xd8, 0xff] },
  // RIFF....WEBP: se revisan "RIFF" al inicio y "WEBP" en el byte 8.
  "image/webp": { extension: "webp", firma: [0x52, 0x49, 0x46, 0x46] },
} as const;
export type FormatoLogo = keyof typeof LOGO_FORMATOS;

/** Solo URLs que la propia app guarda: archivos de /public o https (Storage). */
export const esLogoUrlValida = (url: string | null | undefined): url is string =>
  typeof url === "string" && (/^\/[\w./-]+$/.test(url) || url.startsWith("https://"));
