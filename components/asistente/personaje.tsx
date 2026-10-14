"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

import type { EstadoPersonaje } from "@/components/asistente/conversacion";
import { cn } from "@/lib/utils";

// three.js pesa: se descarga solo cuando se muestra el personaje en 3D.
const Personaje3D = dynamic(() => import("@/components/asistente/personaje-3d"), {
  ssr: false,
  loading: () => <PersonajeCss estado="reposo" />,
});

const PUNTERO_FINO = "(hover: hover) and (pointer: fine)";

function suscribirPuntero(avisar: () => void) {
  const consulta = window.matchMedia(PUNTERO_FINO);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

/**
 * Personaje del asistente. En computadora es 3D; en celular (sin mouse) o con "reducir
 * movimiento" es la versión ligera en CSS, que gasta menos batería y se ve igual de cerca.
 */
export function Personaje({ estado, color, className }: { estado: EstadoPersonaje; color: string; className?: string }) {
  const reducir = useReducedMotion();
  const fino = React.useSyncExternalStore(
    suscribirPuntero,
    () => window.matchMedia(PUNTERO_FINO).matches,
    () => false
  );
  return (
    <div className={cn("relative aspect-square", className)} aria-hidden>
      {fino && !reducir ? <Personaje3D color={color} estado={estado} /> : <PersonajeCss estado={estado} />}
    </div>
  );
}

/** Orbe con ojos dibujado con CSS: flota balanceándose, parpadea, late al hablar y su anillo brilla al pensar. */
function PersonajeCss({ estado }: { estado: EstadoPersonaje }) {
  return (
    <div className="absolute inset-[12%] animate-personaje-flotar">
      <span
        className={cn(
          "absolute -inset-[14%] rounded-full border-2 border-primary/40 transition-colors duration-300",
          estado === "pensando" && "border-primary motion-safe:animate-pulse"
        )}
      />
      <div
        className={cn(
          "relative size-full rounded-full shadow-[0_6px_20px_-6px_var(--color-primary)]",
          "bg-[radial-gradient(circle_at_32%_28%,color-mix(in_srgb,var(--color-primary)_55%,white)_0%,var(--color-primary)_45%,color-mix(in_srgb,var(--color-primary)_60%,black)_100%)]",
          estado === "hablando" && "animate-personaje-latir"
        )}
      >
        {/* Los mismos ojos que el 3D: cápsulas oscuras con un brillo blanco arriba. */}
        <div
          className={cn(
            "absolute inset-x-0 top-[30%] flex h-[26%] items-center justify-center gap-[24%] transition-transform duration-200",
            estado === "pensando" && "-translate-y-[12%]"
          )}
        >
          {[0, 1].map((i) => (
            <span
              key={i}
              className={cn(
                "relative h-full w-[13%] origin-center rounded-full bg-[#14161c] transition-transform duration-200",
                estado === "hablando" ? "scale-y-60" : "animate-personaje-parpadeo"
              )}
            >
              <span className="absolute top-[14%] left-[48%] size-[34%] rounded-full bg-white" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
