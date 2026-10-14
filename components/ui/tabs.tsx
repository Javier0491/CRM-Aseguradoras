"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * Lista de pestañas. En la variante normal, el fondo de la pestaña activa es una sola pieza que se
 * desliza de una a otra (globals.css le quita a cada pestaña su propio fondo). Se coloca sin
 * animación la primera vez y sigue a la activa aunque cambie el ancho de la lista.
 */
function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const lista = React.useRef<HTMLDivElement>(null)
  const indicador = React.useRef<HTMLSpanElement>(null)

  React.useLayoutEffect(() => {
    const el = lista.current
    const ind = indicador.current
    if (!el || !ind) return
    let primera = true
    const colocar = () => {
      const activa = el.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]')
      if (!activa) {
        ind.style.opacity = "0"
        return
      }
      ind.style.transitionDuration = primera ? "0ms" : ""
      ind.style.opacity = "1"
      ind.style.transform = `translate(${activa.offsetLeft}px, ${activa.offsetTop}px)`
      ind.style.width = `${activa.offsetWidth}px`
      ind.style.height = `${activa.offsetHeight}px`
      primera = false
    }
    colocar()
    const cambios = new MutationObserver(colocar)
    cambios.observe(el, { subtree: true, attributes: true, attributeFilter: ["data-state"] })
    const tamano = new ResizeObserver(colocar)
    tamano.observe(el)
    return () => {
      cambios.disconnect()
      tamano.disconnect()
    }
  }, [])

  return (
    <TabsPrimitive.List
      ref={lista}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn("relative", tabsListVariants({ variant }), className)}
      {...props}
    >
      {variant === "default" && (
        <span
          ref={indicador}
          data-slot="tabs-indicador"
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-md border border-primary/30 bg-background opacity-0 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_18px_-8px_var(--color-primary)] transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none dark:border-primary/40 dark:bg-primary/15"
        />
      )}
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-[color,background-color,border-color,box-shadow] group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
