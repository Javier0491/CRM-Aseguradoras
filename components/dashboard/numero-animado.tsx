"use client";

import * as React from "react";
import { animate, useReducedMotion } from "framer-motion";

/** "$58,930.57" → prefijo "$", número 58930.57 con 2 decimales, sufijo "". */
const PARTES = /^(\D*?)(-?[\d,]+(?:\.(\d+))?)(.*)$/;

/**
 * Muestra un valor ya formateado ("$58,930.57", "56", "100.0%") contando desde cero la primera vez
 * que se ve. Conserva el prefijo, el sufijo, los decimales y los separadores de miles del texto. El
 * servidor pinta el valor final (sin JavaScript se ve igual) y el conteo empieza antes del primer
 * cuadro, así que no parpadea. Con "reducir movimiento" se queda fijo.
 */
export function NumeroAnimado({ valor, duracion = 0.9 }: { valor: string; duracion?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reducir = useReducedMotion();

  React.useLayoutEffect(() => {
    const el = ref.current;
    const partes = PARTES.exec(valor);
    if (!el || reducir || !partes) return;
    const [, prefijo, numero, decimales = "", sufijo] = partes;
    const final = Number(numero.replace(/,/g, ""));
    if (!Number.isFinite(final) || final === 0) return;
    const formato = new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: decimales.length,
      maximumFractionDigits: decimales.length,
    });
    const pintar = (n: number) => {
      el.textContent = `${prefijo}${formato.format(n)}${sufijo}`;
    };
    pintar(0);
    const control = animate(0, final, { duration: duracion, ease: [0.22, 1, 0.36, 1], onUpdate: pintar });
    return () => {
      control.stop();
      el.textContent = valor;
    };
  }, [valor, reducir, duracion]);

  // key: si el valor cambia (otro periodo), el span se monta de nuevo y React no pierde su texto.
  return (
    <span key={valor} ref={ref}>
      {valor}
    </span>
  );
}
