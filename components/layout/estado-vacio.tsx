import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Estado vacío de un listado o módulo: el ícono en una pieza con relieve, rodeado de dos anillos
 * que se expanden despacio (un "radar" que espera datos), título, explicación y una acción.
 */
export function EstadoVacio({
  icono: Icono,
  titulo,
  descripcion,
  accion,
  tono = "primary",
  className,
}: {
  icono: LucideIcon;
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  /** Botón o enlace para salir del vacío (p. ej. capturar la primera póliza). */
  accion?: React.ReactNode;
  tono?: "primary" | "muted" | "destructive";
  className?: string;
}) {
  const anillo = { primary: "border-primary/40", muted: "border-muted-foreground/30", destructive: "border-destructive/40" }[tono];
  const icono = { primary: "text-primary", muted: "text-muted-foreground", destructive: "text-destructive" }[tono];
  return (
    <div className={cn("flex animate-entrar flex-col items-center gap-3 px-6 py-14 text-center", className)}>
      <div className="relative mb-1 grid size-16 place-items-center">
        <span aria-hidden className={cn("vacio-anillo absolute inset-0 rounded-2xl border", anillo)} />
        <span aria-hidden className={cn("vacio-anillo absolute inset-0 rounded-2xl border [animation-delay:1.6s]", anillo)} />
        <span
          className={cn(
            "relative grid size-14 place-items-center rounded-2xl border bg-card shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_10px_28px_-14px_var(--color-primary)]",
            icono
          )}
        >
          <Icono className="size-6" />
        </span>
      </div>
      <p className="font-medium text-balance">{titulo}</p>
      {descripcion && <div className="max-w-sm text-sm text-pretty text-muted-foreground">{descripcion}</div>}
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  );
}
