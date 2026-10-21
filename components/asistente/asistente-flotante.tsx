"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { ChatAsistente } from "@/components/asistente/chat-asistente";
import { estadoPersonaje, useConversacion } from "@/components/asistente/conversacion";
import { Personaje } from "@/components/asistente/personaje";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Lugar del personaje (en px, igual que sus clases): a la derecha y abajo, en celular y en computadora. */
const LUGAR = {
  movil: { derecha: 16, abajo: 80 },
  escritorio: { derecha: 24, abajo: 24 },
};
const TAMANO = 64;
/** Lo que se asoma del personaje cuando se hace a un lado: cabe en el margen de la página. */
const ASOMA = { movil: 14, escritorio: 20 };

/** Lo que se puede pulsar: si queda debajo del personaje, este se hace a un lado. */
const PULSABLE =
  'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="combobox"], [role="menuitem"], [contenteditable="true"]';

/** Campos donde se escribe: mientras uno tiene el foco, el asistente no estorba. */
const ESCRITURA = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"]), textarea, select, [contenteditable="true"]';

/**
 * Si el personaje, en su lugar, taparía un botón, un enlace o un campo de la página (p. ej.
 * "Guardar póliza" al final del formulario), o si se está escribiendo en un campo, devuelve cuánto
 * correrlo a la derecha para que solo se asome por la orilla; si no estorba, 0. Se vuelve a revisar
 * al desplazarse, al cambiar el tamaño de la ventana y cuando cambia el contenido de la página.
 */
function useDesplazamiento(activo: boolean, pathname: string) {
  const [desplazamiento, setDesplazamiento] = React.useState(0);

  React.useEffect(() => {
    if (!activo) return;
    let cuadro = 0;
    let escribiendo = false;

    function revisar() {
      cuadro = 0;
      const escritorio = window.matchMedia("(min-width: 768px)").matches;
      const { derecha, abajo } = escritorio ? LUGAR.escritorio : LUGAR.movil;
      const izq = window.innerWidth - derecha - TAMANO;
      const sup = window.innerHeight - abajo - TAMANO;
      let tapa = false;
      // Una rejilla de 3×3 puntos sobre el lugar del personaje (no sobre donde esté ahora).
      revision: for (const fx of [0.1, 0.5, 0.9]) {
        for (const fy of [0.1, 0.5, 0.9]) {
          for (const el of document.elementsFromPoint(izq + TAMANO * fx, sup + TAMANO * fy)) {
            if (el.closest("[data-asistente-flotante]")) continue;
            if (el.closest(PULSABLE)) {
              tapa = true;
              break revision;
            }
          }
        }
      }
      setDesplazamiento(tapa || escribiendo ? derecha + TAMANO - (escritorio ? ASOMA.escritorio : ASOMA.movil) : 0);
    }
    const programar = () => {
      if (!cuadro) cuadro = requestAnimationFrame(revisar);
    };
    const foco = (e: FocusEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      escribiendo = e.type === "focusin" && el !== null && el.matches(ESCRITURA) && !el.closest("[data-asistente-flotante]");
      programar();
    };

    programar();
    window.addEventListener("scroll", programar, { capture: true, passive: true });
    window.addEventListener("resize", programar);
    document.addEventListener("focusin", foco);
    document.addEventListener("focusout", foco);
    const observador = new MutationObserver(programar);
    observador.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (cuadro) cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", programar, { capture: true });
      window.removeEventListener("resize", programar);
      document.removeEventListener("focusin", foco);
      document.removeEventListener("focusout", foco);
      observador.disconnect();
    };
  }, [activo, pathname]);

  return desplazamiento;
}

/**
 * El asistente a la vista en todo el CRM: el personaje flota abajo a la derecha y abre el chat en
 * un panel lateral sin salir de la pantalla. En su propia página (/asistente) no se muestra. Si
 * estorba (tapa un botón o se está escribiendo en un formulario), se hace a un lado y solo se asoma
 * por la orilla; al pasar el mouse vuelve a salir, y pulsarlo siempre abre el chat.
 */
export function AsistenteFlotante({ asistente, usuario, color }: { asistente: string; usuario: string | null; color: string }) {
  const pathname = usePathname();
  const reducir = useReducedMotion();
  const [abierto, setAbierto] = React.useState(false);
  const conversacion = useConversacion();
  const estado = estadoPersonaje(conversacion);
  const etiqueta = asistente === "Asistente" ? "Pregúntale a tu asistente" : `Pregúntale a ${asistente}`;
  const visible = !pathname.startsWith("/asistente");
  const desplazamiento = useDesplazamiento(visible && !abierto, pathname);
  const [asomado, setAsomado] = React.useState(false);
  const aUnLado = desplazamiento > 0 && !asomado;

  if (!visible) return null;

  return (
    <>
      <AnimatePresence>
        {!abierto && (
          <motion.button
            type="button"
            onClick={() => {
              setAsomado(false);
              setAbierto(true);
            }}
            aria-label={etiqueta}
            data-asistente-flotante
            data-a-un-lado={aUnLado || undefined}
            // Hecho a un lado, sale al acercarle el mouse o el foco del teclado.
            onHoverStart={() => setAsomado(true)}
            onHoverEnd={() => setAsomado(false)}
            onFocus={() => setAsomado(true)}
            onBlur={() => setAsomado(false)}
            initial={reducir ? false : { opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: aUnLado ? 0.85 : 1, scale: 1, y: 0, x: aUnLado ? desplazamiento : 0 }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
            transition={reducir ? { duration: 0 } : { type: "spring", visualDuration: 0.45, bounce: aUnLado ? 0 : 0.35 }}
            whileTap={{ scale: 0.92 }}
            className={cn(
              // En celular queda arriba de la barra de acciones de cliente y póliza.
              // El botón es solo el círculo: el nombre va fuera de él para que su espacio (invisible
              // mientras no se pasa el mouse) no tape ni capture los clics de lo que está debajo.
              "group fixed right-4 bottom-20 z-40 size-16 rounded-full outline-none md:right-6 md:bottom-6",
              // El área del botón llega hasta la orilla: al salir de su lugar a un lado, el mouse sigue encima.
              "after:absolute after:inset-y-0 after:left-full after:w-4 md:after:w-6",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50"
            )}
          >
            {/* El nombre aparece al pasar el mouse (y siempre mientras responde), a la izquierda del círculo. */}
            <span
              className={cn(
                "pointer-events-none absolute top-1/2 right-full mr-2 hidden -translate-y-1/2 rounded-full border bg-card/95 px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg backdrop-blur md:block",
                "translate-x-2 opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
                estado !== "reposo" && "translate-x-0 opacity-100",
                // A un lado, el nombre no se asoma (taparía lo que el personaje dejó libre).
                aUnLado && "invisible"
              )}
            >
              {estado === "pensando" ? `${asistente} está pensando…` : estado === "hablando" ? `${asistente} está respondiendo…` : etiqueta}
            </span>
            <span className="relative grid size-full place-items-center rounded-full border border-primary/30 bg-card/90 shadow-[0_10px_30px_-10px_var(--color-primary)] backdrop-blur transition-[box-shadow,scale] duration-200 ease-out group-hover:scale-105 group-hover:shadow-[0_14px_40px_-8px_var(--color-primary)] motion-reduce:group-hover:scale-100">
              <Personaje estado={estado} color={color} className="size-16" />
              {/* Aviso discreto mientras llega una respuesta con el panel cerrado. */}
              {estado !== "reposo" && (
                <span className="absolute top-0.5 right-0.5 size-3 rounded-full border-2 border-card bg-primary motion-safe:animate-pulse" />
              )}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetTitle className="sr-only">{asistente}</SheetTitle>
          <SheetDescription className="sr-only">Chat con el asistente de seguros</SheetDescription>
          <ChatAsistente
            asistente={asistente}
            usuario={usuario}
            color={color}
            variante="panel"
            onNavegar={() => setAbierto(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
