"use client";

import * as React from "react";

/**
 * Si el navegador puede crear un contexto WebGL (3D). Puede faltar en equipos con la aceleración
 * por hardware apagada, en modo de bloqueo, con controladores viejos o cuando la tarjeta gráfica
 * no está disponible. Se calcula una vez por página.
 */
let webgl: boolean | undefined;
function hayWebgl() {
  if (webgl === undefined) {
    try {
      const lienzo = document.createElement("canvas");
      webgl = Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

const sinSuscripcion = () => () => {};

/** WebGL disponible (siempre false en el servidor y al hidratar; luego, lo que diga el navegador). */
export function useWebgl() {
  return React.useSyncExternalStore(sinSuscripcion, hayWebgl, () => false);
}

/**
 * Contiene un lienzo 3D (three.js / React Three Fiber): sin WebGL ni siquiera lo monta, y si
 * falla al dibujarse (p. ej. "THREE.WebGLRenderer: Error creating WebGL context", que la librería
 * relanza en el render) muestra el respaldo en lugar de tumbar la pantalla entera. El 3D del CRM y
 * de la landing es decorativo: nunca debe impedir usar la página.
 */
export function Limite3D({ respaldo = null, children }: { respaldo?: React.ReactNode; children: React.ReactNode }) {
  const disponible = useWebgl();
  if (!disponible) return respaldo;
  return <LimiteError respaldo={respaldo}>{children}</LimiteError>;
}

class LimiteError extends React.Component<{ respaldo: React.ReactNode; children: React.ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[3D] no se pudo dibujar; se muestra el respaldo.", error);
  }
  render() {
    return this.state.fallo ? this.props.respaldo : this.props.children;
  }
}
