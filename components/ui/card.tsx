import * as React from "react"
import { cn } from "cn"

/**
 * Tarjeta. Su borde y su interior reflejan la luz del cursor (data-slot="card-luz", ver
 * globals.css y components/layout/ambiente-espacio.tsx). Las capas son absolutas: no ocupan lugar
 * ni entran en `gap`; van primero para no afectar a `space-y` (que mira al último hijo) y, con
 * `isolate`, quedan detrás del contenido pero encima del fondo.
 *
 * Con `acento` (un color CSS: el de una aseguradora, el tono de un cliente, var(--color-warning)…)
 * la tarjeta lleva una línea de ese color con brillo arriba, un halo en la esquina y la luz del
 * cursor de ese color: el estilo de las tarjetas de Aseguradoras.
 */
function Card({
  className,
  children,
  acento,
  style,
  ...props
}: React.ComponentProps<"div"> & { acento?: string }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "relative isolate flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
        acento && "overflow-hidden",
        className
      )}
      style={
        acento
          ? ({ "--acento": acento, "--luz": `color-mix(in srgb, ${acento} 75%, white)`, ...style } as React.CSSProperties)
          : style
      }
      {...props}
    >
      <span data-slot="card-luz" aria-hidden />
      {acento && <span data-slot="card-acento" aria-hidden />}
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
