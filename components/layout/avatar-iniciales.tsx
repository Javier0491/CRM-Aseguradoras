import { cn } from "@/lib/utils";

/** Tono estable por nombre: la misma persona siempre tiene el mismo color. */
function tonoDe(nombre: string) {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 360;
  return h;
}

/** Color propio de una persona o empresa (el de su avatar): para el acento de su tarjeta. */
export const colorDeNombre = (nombre: string) => `hsl(${tonoDe(nombre)} 58% 52%)`;

/** "Comercializadora del Centro, S.A. de C.V." → "CC"; "Ana Lucía Torres" → "AT". */
export function iniciales(nombre: string) {
  const palabras = nombre
    .replace(/[,.]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p))
    .filter((p) => !/^(de|del|la|las|los|y|sa|cv|sc|rl)$/i.test(p));
  if (palabras.length === 0) return nombre.slice(0, 2).toUpperCase();
  const [primera, ...resto] = palabras;
  return (primera[0] + (resto.at(-1)?.[0] ?? primera[1] ?? "")).toUpperCase();
}

/**
 * Iniciales de una persona o empresa sobre un degradado de su propio tono, con un aro sutil: le da
 * cara a cada renglón de un listado sin depender de fotos.
 */
export function AvatarIniciales({ nombre, className }: { nombre: string; className?: string }) {
  const h = tonoDe(nombre);
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-1 ring-white/10 select-none",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_12px_-6px_rgb(0_0_0/0.5)]",
        className
      )}
      style={{ backgroundImage: `linear-gradient(140deg, hsl(${h} 55% 55%), hsl(${(h + 40) % 360} 60% 32%))` }}
    >
      {iniciales(nombre)}
    </span>
  );
}
