import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  // Al pasar el mouse los botones sólidos suben 1 px y su sombra de color crece; al presionar ceden
  // un poco (scale 0.97): confirman el toque al instante. El ícono crece apenas al pasar encima.
  // Solo se animan color, borde, sombra, escala y desplazamiento (nunca transition-all). El
  // hover solo aplica con mouse (@media hover), así no se queda "pegado" en pantallas táctiles.
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,scale,translate] duration-150 ease-out outline-none active:translate-y-0 active:scale-[0.97] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-150 [&_svg]:ease-out [&_svg:not([class*='size-'])]:size-4 hover:[&_svg:not(.animate-spin)]:scale-110 motion-reduce:hover:translate-y-0 motion-reduce:hover:[&_svg]:scale-100",
  {
    variants: {
      variant: {
        // Brillo superior (inset) y sombra del color de la marca: se lee como botón principal.
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.2),0_4px_14px_-4px_var(--color-primary)] hover:-translate-y-px hover:bg-primary/92 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_2px_4px_rgb(0_0_0/0.2),0_8px_22px_-6px_var(--color-primary)]",
        destructive:
          "bg-destructive text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_4px_14px_-4px_var(--color-destructive)] hover:-translate-y-px hover:bg-destructive/90 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_8px_22px_-6px_var(--color-destructive)] focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:border-primary/50 hover:bg-primary/5 hover:text-primary dark:border-input dark:bg-input/30 dark:hover:border-primary/50 dark:hover:bg-primary/10",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:-translate-y-px hover:bg-secondary/80 hover:shadow-sm",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
