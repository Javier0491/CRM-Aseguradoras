"use client";

import * as React from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";

import { cn } from "@/lib/utils";

/** Resorte de la inclinación: sigue al cursor con un poco de inercia, sin rebotar. */
const RESORTE = { stiffness: 240, damping: 22, mass: 0.6 };

/**
 * Inclina su contenido en 3D hacia el cursor (unos grados) y vuelve a su lugar al salir. Solo con
 * mouse y sin "reducir movimiento"; es decorativo: no cambia lo que se puede hacer con la tarjeta.
 */
export function Inclinable({
  children,
  className,
  grados = 6,
}: {
  children: React.ReactNode;
  className?: string;
  /** Inclinación máxima hacia cada lado. */
  grados?: number;
}) {
  const reducir = useReducedMotion();
  const rotateX = useSpring(0, RESORTE);
  const rotateY = useSpring(0, RESORTE);

  function mover(e: React.PointerEvent<HTMLDivElement>) {
    if (reducir || e.pointerType !== "mouse") return;
    const caja = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - caja.left) / caja.width - 0.5;
    const y = (e.clientY - caja.top) / caja.height - 0.5;
    rotateY.set(x * grados * 2);
    rotateX.set(-y * grados * 2);
  }
  function soltar() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      className={cn("[transform-style:preserve-3d]", className)}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={mover}
      onPointerLeave={soltar}
    >
      {children}
    </motion.div>
  );
}
