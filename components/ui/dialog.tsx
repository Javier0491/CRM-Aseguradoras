"use client"

import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 duration-200 ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/** Mismo corte que `sm`: por debajo, el diálogo es un panel inferior. */
const CELULAR = "(max-width: 639.98px)"
/** Un lanzamiento hacia abajo más rápido que esto cierra aunque haya recorrido poco (px/ms). */
const VELOCIDAD_CIERRE = 0.11

type Gesto = {
  id: number
  y0: number
  activo: boolean
  muestras: { y: number; t: number }[]
}

/**
 * Arrastrar hacia abajo para cerrar, solo en el celular: desde la barrita o el encabezado. El
 * panel sigue al dedo 1:1 (hacia arriba cede con resistencia) y el fondo se aclara a la par. Al
 * soltar cierra si se lanzó hacia abajo o si bajó más de un cuarto de su alto; si no, regresa a
 * su lugar con la curva de los paneles de iOS.
 */
function useArrastreParaCerrar(cerrar: () => void) {
  const panel = React.useRef<HTMLDivElement | null>(null)
  const gesto = React.useRef<Gesto | null>(null)
  const setPanel = React.useCallback((el: HTMLDivElement | null) => {
    panel.current = el
  }, [])

  const fondo = () => {
    const anterior = panel.current?.previousElementSibling
    return anterior instanceof HTMLElement && anterior.dataset.slot === "dialog-overlay" ? anterior : null
  }

  function colocar(y: number, transicion?: string) {
    const el = panel.current
    if (!el) return
    const alto = el.offsetHeight || 1
    el.style.transition = transicion ? `transform ${transicion}` : "none"
    el.style.transform = y === 0 ? "" : `translateY(${y}px)`
    const f = fondo()
    if (f) {
      f.style.transition = transicion ? `opacity ${transicion}` : "none"
      f.style.opacity = y <= 0 ? "" : String(Math.max(0, 1 - y / alto))
    }
  }

  function regresar() {
    colocar(0, "300ms var(--ease-drawer)")
    window.setTimeout(() => {
      if (panel.current) panel.current.style.transition = ""
      const f = fondo()
      if (f) f.style.transition = ""
    }, 320)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = panel.current
    const objetivo = e.target as HTMLElement
    if (!el || gesto.current || !window.matchMedia(CELULAR).matches) return
    if (e.pointerType === "mouse" && e.button !== 0) return
    // Solo desde la barrita o el encabezado, nunca desde un control, y con el panel arriba del todo.
    if (!objetivo.closest('[data-slot="dialog-grabber"],[data-slot="dialog-header"]')) return
    if (objetivo.closest("button,a,input,textarea,select,[role=combobox]") || el.scrollTop > 0) return
    // Si lo toman mientras aún entra o regresa, el arrastre parte de donde está en pantalla.
    const actual = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42
    el.getAnimations().forEach((a) => a.cancel())
    colocar(actual)
    gesto.current = { id: e.pointerId, y0: e.clientY - actual, activo: false, muestras: [{ y: e.clientY, t: e.timeStamp }] }
    // Con la captura, el arrastre sigue aunque el dedo salga del panel (si el puntero ya no existe, no pasa nada).
    try {
      el.setPointerCapture(e.pointerId)
    } catch {}
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesto.current
    const el = panel.current
    if (!g || !el || e.pointerId !== g.id) return
    const dy = e.clientY - g.y0
    if (!g.activo && Math.abs(dy) < 4) return
    g.activo = true
    g.muestras.push({ y: e.clientY, t: e.timeStamp })
    if (g.muestras.length > 6) g.muestras.shift()
    // Hacia arriba no hay a dónde ir: cede cada vez menos (como una liga).
    const alto = el.offsetHeight || 1
    const y = dy >= 0 ? dy : -((-dy * alto * 0.55) / (alto + 0.55 * -dy)) * 0.15
    colocar(y)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesto.current
    const el = panel.current
    if (!g || e.pointerId !== g.id) return
    gesto.current = null
    try {
      if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    } catch {}
    if (!el) return
    // Un toque sin arrastre (p. ej. lo tomaron mientras entraba): vuelve a su lugar.
    if (!g.activo) return regresar()
    const dy = e.clientY - g.y0
    const primera = g.muestras[0]
    const ultima = { y: e.clientY, t: e.timeStamp }
    const velocidad = (ultima.y - primera.y) / Math.max(1, ultima.t - primera.t)
    if (dy > 0 && (velocidad > VELOCIDAD_CIERRE || dy > el.offsetHeight / 4)) {
      // Sale por donde entró, desde donde quedó el dedo; luego se cierra sin otra animación.
      el.dataset.arrastrado = "true"
      colocar(el.offsetHeight, "200ms var(--ease-out)")
      window.setTimeout(() => {
        cerrar()
        // Si el diálogo no se dejó cerrar (p. ej. mientras guarda), regresa.
        window.setTimeout(() => {
          if (panel.current?.isConnected && panel.current.dataset.state === "open") {
            delete panel.current.dataset.arrastrado
            regresar()
          }
        }, 80)
      }, 200)
    } else {
      regresar()
    }
  }

  return { setPanel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const cerrarRef = React.useRef<HTMLButtonElement>(null)
  const { setPanel, ...arrastre } = useArrastreParaCerrar(() => cerrarRef.current?.click())
  const refs = React.useCallback(
    (el: HTMLDivElement | null) => {
      setPanel(el)
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [setPanel, ref]
  )

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={refs}
        data-slot="dialog-content"
        onPointerDown={arrastre.onPointerDown}
        onPointerMove={arrastre.onPointerMove}
        onPointerUp={arrastre.onPointerUp}
        onPointerCancel={arrastre.onPointerCancel}
        className={cn(
          "fixed z-50 grid w-full gap-4 border bg-background shadow-lg outline-none",
          // Celular: panel inferior a todo lo ancho, con su propio scroll; entra desde abajo con la
          // curva de iOS y sale por el mismo lado, más rápido.
          "max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[90svh] max-sm:overflow-y-auto max-sm:rounded-t-2xl max-sm:border-b-0 max-sm:px-5 max-sm:pt-0 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          "duration-400 ease-drawer data-[state=closed]:duration-250 data-[state=closed]:ease-out",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[arrastrado=true]:animate-none!",
          // Escritorio: diálogo centrado que aparece desde 95 % con opacidad.
          "sm:top-[50%] sm:left-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6",
          "sm:duration-200 sm:ease-out sm:data-[state=closed]:duration-150 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
          // Con "reducir movimiento", el panel aparece y se va con opacidad, sin desplazarse.
          "motion-reduce:data-[state=open]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:slide-out-to-bottom-0 motion-reduce:data-[state=open]:fade-in-0 motion-reduce:data-[state=closed]:fade-out-0",
          className
        )}
        {...props}
      >
        {/* Barrita del panel (solo celular): de aquí, o del encabezado, se arrastra para cerrar. */}
        <div
          aria-hidden
          data-slot="dialog-grabber"
          className="-mx-5 flex h-7 cursor-grab touch-none items-center justify-center select-none sm:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
        {/* Cierre que usa el arrastre: pasa por onOpenChange como cualquier otro. */}
        <DialogPrimitive.Close ref={cerrarRef} hidden tabIndex={-1} aria-hidden />
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center max-sm:touch-none sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
