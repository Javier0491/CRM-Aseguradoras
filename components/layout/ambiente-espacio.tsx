"use client";

import * as React from "react";

/** Mitad del foco de luz (el elemento mide el doble): coincide con .espacio-foco en globals.css. */
const RADIO_FOCO = 320;

/**
 * Ambiente del área de trabajo: el cursor es una fuente de luz sobre una superficie oscura.
 *
 * - Fondo: una rejilla de puntos tenue, un brillo de la marca arriba y un foco que revela la
 *   rejilla con el color de la marca alrededor del cursor.
 * - Tarjetas: su borde y su interior reflejan esa luz donde pasa el cursor (data-slot="card-luz").
 *
 * Un solo listener para todo el CRM. Cada cuadro solo mueve el foco (transform, sin repintar la
 * página) y escribe dos variables en la capa de luz de la tarjeta bajo el cursor, que no tiene
 * hijos: no recalcula estilos de nada más. Solo con mouse y sin "reducir movimiento".
 */
export function AmbienteEspacio() {
  const foco = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const puntero = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)");
    let x = 0;
    let y = 0;
    let objetivo: Element | null = null;
    let cuadro = 0;

    const pintar = () => {
      cuadro = 0;
      const f = foco.current;
      if (f && !reducir.matches) {
        const tx = x - RADIO_FOCO;
        const ty = y - RADIO_FOCO;
        f.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        // La rejilla del foco queda alineada con la del fondo aunque el foco se mueva.
        f.style.backgroundPosition = `${-tx}px ${-ty}px`;
        f.style.opacity = "1";
      }
      const tarjeta = objetivo?.closest('[data-slot="card"]');
      const luz = tarjeta?.querySelector<HTMLElement>(':scope > [data-slot="card-luz"]');
      if (tarjeta && luz) {
        const caja = tarjeta.getBoundingClientRect();
        luz.style.setProperty("--lx", `${x - caja.left}px`);
        luz.style.setProperty("--ly", `${y - caja.top}px`);
      }
    };

    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !puntero.matches) return;
      x = e.clientX;
      y = e.clientY;
      objetivo = e.target instanceof Element ? e.target : null;
      cuadro ||= requestAnimationFrame(pintar);
    };
    const apagar = () => {
      if (foco.current) foco.current.style.opacity = "0";
    };

    window.addEventListener("pointermove", mover, { passive: true });
    document.documentElement.addEventListener("pointerleave", apagar);
    return () => {
      window.removeEventListener("pointermove", mover);
      document.documentElement.removeEventListener("pointerleave", apagar);
      cancelAnimationFrame(cuadro);
    };
  }, []);

  return (
    // z-index negativo dentro del área de trabajo (isolate): detrás del contenido, encima de su fondo.
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="espacio-aurora" />
      <div className="espacio-rejilla" />
      <div ref={foco} className="espacio-foco" />
    </div>
  );
}
