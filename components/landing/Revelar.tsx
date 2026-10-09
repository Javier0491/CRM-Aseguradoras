"use client";

import { useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Misma curva que --ease-out (app/globals.css), para las animaciones de Framer Motion. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Aparición al entrar en pantalla, una sola vez (solo en la landing: es contenido de marketing, no
 * interfaz que se visita a diario). Es una transición CSS: con "reducir movimiento" queda el fundido
 * sin desplazamiento, y el servidor y el cliente pintan lo mismo al hidratar.
 */
export function Revelar({ children, retraso = 0, className }: { children: ReactNode; retraso?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div
      ref={ref}
      data-visible={visible}
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
      className={cn(
        "translate-y-5 opacity-0 [transition:opacity_700ms_var(--ease-out),translate_700ms_var(--ease-out)] data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100 motion-reduce:translate-y-0",
        className
      )}
    >
      {children}
    </div>
  );
}
