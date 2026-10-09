"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import type { PointerEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Resorte del efecto magnético (seguimiento decorativo del cursor). */
const RESORTE = { visualDuration: 0.5, bounce: 0.2 };

/**
 * El botón sigue un poco al cursor mientras está encima y regresa con un resorte al salir. Solo con
 * mouse: en pantallas táctiles el "hover" es un toque y no hay nada que seguir.
 */
export function Magnetico({ children, fuerza = 0.28, className }: { children: ReactNode; fuerza?: number; className?: string }) {
  const reducir = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, RESORTE);
  const sy = useSpring(y, RESORTE);
  const transform = useMotionTemplate`translate3d(${sx}px, ${sy}px, 0)`;

  const mover = (e: PointerEvent<HTMLSpanElement>) => {
    if (reducir || e.pointerType !== "mouse") return;
    const caja = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (caja.left + caja.width / 2)) * fuerza);
    y.set((e.clientY - (caja.top + caja.height / 2)) * fuerza * 1.3);
  };
  const soltar = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span className={cn("inline-flex", className)} style={{ transform }} onPointerMove={mover} onPointerLeave={soltar}>
      {children}
    </motion.span>
  );
}

/**
 * Borde de 1 px con un degradado cónico que gira sin parar detrás del contenido: el "borde
 * brillante continuo" de los CTA VIP. Solo gira un transform (no repinta el botón).
 */
export function BordeBrillante({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "relative isolate inline-flex overflow-hidden rounded-full bg-white/15 p-px shadow-[0_0_38px_-8px_rgba(61,107,255,0.75)]",
        className
      )}
    >
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 -z-10 aspect-square w-[max(250%,18rem)] -translate-x-1/2 -translate-y-1/2 animate-landing-orbita bg-[conic-gradient(from_0deg,transparent_0deg,transparent_200deg,#3d6bff_285deg,#e6e9f0_330deg,transparent_360deg)]"
      />
      {children}
    </span>
  );
}
