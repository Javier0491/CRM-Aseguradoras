"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

import type { PlanDemo } from "@/lib/landing/demo";

type PlanElegido = { plan: PlanDemo; elegirPlan: (plan: PlanDemo) => void };

const PlanElegidoContext = createContext<PlanElegido | null>(null);

/** El plan que el visitante eligió en la tabla de precios llega preseleccionado al formulario de demo. */
export function EstadoLanding({ children }: { children: ReactNode }) {
  const [plan, elegirPlan] = useState<PlanDemo>("indeciso");
  return <PlanElegidoContext value={{ plan, elegirPlan }}>{children}</PlanElegidoContext>;
}

export function usePlanElegido() {
  const contexto = useContext(PlanElegidoContext);
  if (!contexto) throw new Error("usePlanElegido requiere <EstadoLanding>.");
  return contexto;
}

const sinSuscripcion = () => () => {};

/**
 * "Reducir movimiento" del sistema, pero false mientras se hidrata: el servidor no lo conoce y el
 * primer render del cliente debe coincidir con su HTML.
 */
export function useMovimientoReducido() {
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const reducir = useReducedMotion();
  return hidratado && reducir === true;
}
