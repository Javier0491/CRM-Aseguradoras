// Clases de los CTA de la landing. Viven fuera de los módulos "use client": un Server Component que
// importa una constante de uno de ellos recibe una referencia de cliente, no el texto.

/** Interior del CTA VIP: fondo casi negro para que el degradado solo asome por el borde. */
export const CLASE_CTA_VIP =
  "relative inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#07080d] px-6 text-sm font-medium text-white [transition:scale_160ms_var(--ease-out),background-color_200ms_ease] hover:bg-[#0b0d16] active:scale-[0.97]";

/** CTA secundario de cristal. */
export const CLASE_CTA_CRISTAL =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 text-sm font-medium text-white/90 backdrop-blur-md [transition:scale_160ms_var(--ease-out),background-color_200ms_ease,border-color_200ms_ease] hover:border-white/25 hover:bg-white/[0.08] active:scale-[0.97]";
