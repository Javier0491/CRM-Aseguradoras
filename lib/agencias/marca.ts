// Identidad visual (white-label) de cada agencia: color de marca y logo.

/** Color de marca cuando la agencia no ha elegido uno (el dorado original del CRM). */
export const COLOR_MARCA_PREDETERMINADO = "#C5A059";

/** Fondo de la interfaz: "dark" (el original) o "light". */
export const TEMAS = [
  { value: "dark", label: "Modo oscuro" },
  { value: "light", label: "Modo claro" },
] as const;
export type Tema = (typeof TEMAS)[number]["value"];
export const TEMA_PREDETERMINADO: Tema = "dark";
export const esTema = (v: unknown): v is Tema => typeof v === "string" && TEMAS.some((t) => t.value === v);

/** Fondo de cada tema (globals.css); se usa para advertir colores de marca con poco contraste. */
export const FONDO_TEMA: Record<Tema, string> = { dark: "#0A0A0A", light: "#FFFFFF" };

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

/**
 * Logo para correos y documentos: el de documentos o, si no hay, el ícono. Solo sirven los
 * subidos a Storage (https): una ruta de /public no carga fuera de la app.
 */
export function logoParaDocumentos(agencia: { logoUrl: string | null; logoDocumentosUrl: string | null }) {
  return [agencia.logoDocumentosUrl, agencia.logoUrl].find((u) => u?.startsWith("https://")) ?? null;
}

/** Solo URLs que la propia app guarda: archivos de /public o https (Storage). */
export const esLogoUrlValida = (url: string | null | undefined): url is string =>
  typeof url === "string" && (/^\/[\w./-]+$/.test(url) || url.startsWith("https://"));
