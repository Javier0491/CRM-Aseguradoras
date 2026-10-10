"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

import type { PlanDemo } from "@/lib/landing/demo";
import type { EdicionPlan } from "@/lib/planes/planes";

type PlanElegido = {
  plan: PlanDemo;
  /** Básico o Pro, si se eligió desde una tarjeta que la tiene (Agente o Broker). */
  edicion: EdicionPlan | null;
  elegirPlan: (plan: PlanDemo, edicion?: EdicionPlan | null) => void;
};

const PlanElegidoContext = createContext<PlanElegido | null>(null);

/** El plan (y su edición) que el visitante eligió en la tabla de precios llega preseleccionado al formulario de demo. */
export function EstadoLanding({ children }: { children: ReactNode }) {
  const [eleccion, setEleccion] = useState<{ plan: PlanDemo; edicion: EdicionPlan | null }>({ plan: "indeciso", edicion: null });
  // Cambiar el plan en el formulario conserva la edición; solo Agente y Broker la usan.
  const elegirPlan = (plan: PlanDemo, edicion?: EdicionPlan | null) =>
    setEleccion((actual) => ({ plan, edicion: edicion === undefined ? actual.edicion : edicion }));
  return <PlanElegidoContext value={{ ...eleccion, elegirPlan }}>{children}</PlanElegidoContext>;
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
