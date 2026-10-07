"use client";

import * as React from "react";

import {
  AvatarChat,
  Compositor,
  ElegirPersona,
  HiloMensajes,
  ListaConversaciones,
  type MensajeUI,
} from "@/components/mensajes/panel-chat";
import type { ConversacionResumen, MensajeChat, MiembroChat } from "@/lib/mensajes/reglas";

export type DatosMensajesDev = {
  yo: string;
  hoy: string;
  conversaciones: ConversacionResumen[];
  mensajes: MensajeChat[];
  pendientes: MensajeUI[];
  miembros: MiembroChat[];
};

const sinSuscripcion = () => () => {};

/** Marco con el tamaño del panel del chat (ancho máximo del panel lateral). */
function Marco({ titulo, subtitulo, equipo, children }: { titulo: string; subtitulo?: string; equipo?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex h-[640px] w-full max-w-md min-w-0 flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex min-h-14 items-center gap-2 border-b px-3 py-2">
        {equipo !== undefined && <AvatarChat nombre={titulo} equipo={equipo} className="size-8" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{titulo}</p>
          {subtitulo && <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Solo para la galería de desarrollo: las piezas del chat con datos de prueba, sin servidor. */
export function VistaMensajesDev({ yo, hoy, conversaciones, mensajes, pendientes, miembros }: DatosMensajesDev) {
  // Como en la app (el panel solo se pinta en el navegador): las horas no pasan por el servidor.
  const enNavegador = React.useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const equipo = conversaciones.find((c) => c.tipo === "equipo");
  if (!enNavegador) return null;
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Marco titulo="Mensajes">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ListaConversaciones conversaciones={conversaciones} hoy={hoy} onAbrir={() => {}} />
        </div>
      </Marco>
      <Marco titulo={equipo?.titulo ?? "Todo el equipo"} subtitulo="Canal de toda la agencia" equipo>
        <HiloMensajes
          mensajes={mensajes}
          pendientes={pendientes}
          yo={yo}
          esEquipo
          hoy={hoy}
          hayMas={mensajes.length > 0}
          puedeModerar
          onAnteriores={() => {}}
          onEliminar={() => {}}
          onReintentar={() => {}}
        />
        <Compositor onEnviar={() => {}} placeholder="Escribe a todo el equipo…" />
      </Marco>
      <Marco titulo="Nuevo mensaje">
        <ElegirPersona miembros={miembros} onElegir={() => {}} />
      </Marco>
    </div>
  );
}
