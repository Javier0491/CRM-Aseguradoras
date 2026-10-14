"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { ChatAsistente } from "@/components/asistente/chat-asistente";
import { estadoPersonaje, useConversacion } from "@/components/asistente/conversacion";
import { Personaje } from "@/components/asistente/personaje";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * El asistente a la vista en todo el CRM: el personaje flota abajo a la derecha y abre el chat en
 * un panel lateral sin salir de la pantalla. En su propia página (/asistente) no se muestra.
 */
export function AsistenteFlotante({ asistente, usuario, color }: { asistente: string; usuario: string | null; color: string }) {
  const pathname = usePathname();
  const reducir = useReducedMotion();
  const [abierto, setAbierto] = React.useState(false);
  const conversacion = useConversacion();
  const estado = estadoPersonaje(conversacion);
  const etiqueta = asistente === "Asistente" ? "Pregúntale a tu asistente" : `Pregúntale a ${asistente}`;

  if (pathname.startsWith("/asistente")) return null;

  return (
    <>
      <AnimatePresence>
        {!abierto && (
          <motion.button
            type="button"
            onClick={() => setAbierto(true)}
            aria-label={etiqueta}
            initial={reducir ? false : { opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
            transition={{ type: "spring", visualDuration: 0.45, bounce: 0.35 }}
            whileTap={{ scale: 0.92 }}
            className={cn(
              // En celular queda arriba de la barra de acciones de cliente y póliza.
              "group fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full outline-none md:right-6 md:bottom-6",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50"
            )}
          >
            {/* El nombre aparece al pasar el mouse (y siempre mientras responde). */}
            <span
              className={cn(
                "pointer-events-none hidden rounded-full border bg-card/95 px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg backdrop-blur md:block",
                "translate-x-2 opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
                estado !== "reposo" && "translate-x-0 opacity-100"
              )}
            >
              {estado === "pensando" ? `${asistente} está pensando…` : estado === "hablando" ? `${asistente} está respondiendo…` : etiqueta}
            </span>
            <span className="relative grid size-16 place-items-center rounded-full border border-primary/30 bg-card/90 shadow-[0_10px_30px_-10px_var(--color-primary)] backdrop-blur transition-[box-shadow,scale] duration-200 ease-out group-hover:scale-105 group-hover:shadow-[0_14px_40px_-8px_var(--color-primary)] motion-reduce:group-hover:scale-100">
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
