import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Degradado con relieve de un color: claro arriba a la izquierda, oscuro abajo. */
export const fondoRelieve = (color: string) =>
  `linear-gradient(150deg, color-mix(in srgb, ${color} 70%, white), ${color} 50%, color-mix(in srgb, ${color} 60%, black))`;

/**
 * Pieza cuadrada con relieve del color dado (como los monogramas de Aseguradoras) con un ícono o
 * un texto corto en blanco. Al pasar el mouse por su tarjeta (group/tarjeta) crece y gira un poco.
 */
export function IconoRelieve({
  color,
  icono: Icono,
  texto,
  className,
}: {
  /** Color CSS (var(--color-primary), #00008F, hsl(…)). */
  color: string;
  icono?: LucideIcon;
  /** Monograma o iniciales, si no hay ícono. */
  texto?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl text-[13px] font-bold tracking-tight text-white",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.3),inset_0_-2px_6px_rgb(0_0_0/0.25),0_8px_20px_-10px_rgb(0_0_0/0.6)]",
        "transition-[scale,rotate] duration-200 ease-out group-hover/tarjeta:scale-110 group-hover/tarjeta:-rotate-6 motion-reduce:group-hover/tarjeta:scale-100 motion-reduce:group-hover/tarjeta:rotate-0",
        className
      )}
      style={{ backgroundImage: fondoRelieve(color) }}
    >
      {Icono ? <Icono className="size-5 drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)]" /> : texto}
    </span>
  );
}

/** Color CSS de cada tono de los indicadores. */
export const COLOR_TONO = {
  primary: "var(--color-primary)",
  warning: "var(--color-warning)",
  destructive: "var(--color-destructive)",
  success: "var(--color-success)",
  muted: "var(--color-muted-foreground)",
} as const;
export type Tono = keyof typeof COLOR_TONO;
