import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ícono-gema de un módulo: una pieza brillante del color de la marca, con relieve (luz arriba,
 * sombra abajo) y un reflejo que la cruza una vez al entrar a la pantalla.
 */
export function GemaIcono({ icono: Icono, className }: { icono: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "relative isolate grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl text-primary-foreground",
        "bg-[linear-gradient(150deg,color-mix(in_srgb,var(--color-primary)_65%,white)_0%,var(--color-primary)_45%,color-mix(in_srgb,var(--color-primary)_55%,black)_100%)]",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-3px_8px_rgb(0_0_0/0.22),0_12px_32px_-12px_var(--color-primary)]",
        className
      )}
    >
      <Icono className="relative z-10 size-5 drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]" />
      <span
        aria-hidden
        className="gema-reflejo absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent"
      />
    </span>
  );
}

/**
 * Encabezado de las pantallas de Operación: gema del módulo, título con un destello del color de
 * la marca al entrar, descripción y acciones a la derecha. `children` va debajo de la descripción
 * (avisos cortos, contadores).
 */
export function EncabezadoModulo({
  icono,
  titulo,
  descripcion,
  acciones,
  children,
  className,
  mono,
}: {
  icono: LucideIcon;
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Título en letra monoespaciada (números de póliza). */
  mono?: boolean;
}) {
  return (
    <header className={cn("flex animate-entrar flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-4">
        <GemaIcono icono={icono} />
        <div className="min-w-0">
          <h1
            className={cn(
              "encabezado-titulo text-2xl font-semibold tracking-tight text-balance wrap-anywhere",
              mono && "font-mono text-xl"
            )}
          >
            {titulo}
          </h1>
          {descripcion && <div className="mt-0.5 text-sm text-pretty text-muted-foreground">{descripcion}</div>}
          {children}
        </div>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}
