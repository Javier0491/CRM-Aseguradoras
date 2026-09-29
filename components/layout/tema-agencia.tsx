import { COLOR_MARCA_PREDETERMINADO } from "@/lib/agencias/marca";
import { colorTextoSobre, normalizarHex } from "@/lib/color";

/**
 * Aplica el color de marca de la agencia a toda la interfaz: reemplaza --primary (y su texto)
 * en :root, así también lo toman los diálogos y menús que se renderizan fuera del layout. El
 * resto de colores de marca se derivan de --primary en globals.css.
 */
export function TemaAgencia({ colorHex }: { colorHex: string | null }) {
  // normalizarHex garantiza #RRGGBB: nada del valor guardado llega crudo al CSS.
  const color = normalizarHex(colorHex) ?? COLOR_MARCA_PREDETERMINADO;
  return <style>{`:root{--primary:${color};--primary-foreground:${colorTextoSobre(color)};}`}</style>;
}
