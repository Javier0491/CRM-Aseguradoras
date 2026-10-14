"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, List, Loader2 } from "lucide-react";

import { cookieVista, type ListadoConVista, type VistaListado } from "@/lib/vista-listado";
import { cn } from "@/lib/utils";

const OPCIONES: { vista: VistaListado; etiqueta: string; icono: typeof LayoutGrid }[] = [
  { vista: "tarjetas", etiqueta: "Tarjetas", icono: LayoutGrid },
  { vista: "lista", etiqueta: "Lista", icono: List },
];

/** Guarda la vista elegida un año: el servidor la lee para pintar el listado. */
function guardarVista(listado: ListadoConVista, vista: VistaListado) {
  document.cookie = `${cookieVista(listado)}=${vista}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Alterna un listado entre tarjetas y lista. Guarda la elección en una cookie y pide al servidor
 * la vista nueva; mientras llega, el fondo ya está en la opción elegida (optimista) y gira un
 * indicador.
 */
export function SelectorVista({ listado, vista }: { listado: ListadoConVista; vista: VistaListado }) {
  const router = useRouter();
  const reducir = useReducedMotion();
  const [elegida, setElegida] = React.useOptimistic(vista);
  const [pendiente, startTransition] = React.useTransition();

  function cambiar(nueva: VistaListado) {
    if (nueva === elegida) return;
    guardarVista(listado, nueva);
    startTransition(() => {
      setElegida(nueva);
      router.refresh();
    });
  }

  return (
    <div role="group" aria-label="Ver como" className="relative flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5">
      {OPCIONES.map((o) => {
        const activa = elegida === o.vista;
        return (
          <button
            key={o.vista}
            type="button"
            aria-pressed={activa}
            onClick={() => cambiar(o.vista)}
            className={cn(
              "relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              activa ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {activa && (
              <motion.span
                layoutId={`selector-vista-${listado}`}
                aria-hidden
                className="absolute inset-0 rounded-md border border-primary/40 bg-primary/15 shadow-[0_0_14px_-6px_var(--color-primary)]"
                transition={reducir ? { duration: 0 } : { type: "spring", visualDuration: 0.25, bounce: 0.15 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {activa && pendiente ? <Loader2 className="size-4 animate-spin" /> : <o.icono className="size-4" />}
              <span className="hidden sm:inline">{o.etiqueta}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
