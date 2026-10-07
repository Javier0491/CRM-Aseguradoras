"use client";

import * as React from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null | undefined;

/**
 * Cliente de Supabase del navegador (con la sesión de las cookies), o null si falta configuración.
 * No renueva la sesión por su cuenta: ya la renueva el servidor (proxy) en cada consulta, también
 * las del chat, y dos renovaciones a la vez podrían invalidarse entre sí.
 */
function supabaseNavegador() {
  if (cliente !== undefined) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const llave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  try {
    cliente =
      url && llave
        ? createBrowserClient(new URL(url).origin, llave, { auth: { autoRefreshToken: false, detectSessionInUrl: false } })
        : null;
  } catch {
    cliente = null;
  }
  return cliente;
}

/**
 * Escucha el tema privado de la persona ("chat:<id>") en Supabase Realtime: el servidor avisa ahí
 * cuando cambia una conversación suya y `alAviso` vuelve a consultar el chat. También avisa al
 * conectarse (o reconectarse) para ponerse al día. Devuelve si está conectado: mientras no, el
 * chat consulta más seguido.
 */
export function useAvisosTiempoReal(usuarioId: string, alAviso: () => void): boolean {
  const [conectado, setConectado] = React.useState(false);
  const avisar = React.useEffectEvent(alAviso);

  React.useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    let vigente = true;
    let canal: ReturnType<SupabaseClient["channel"]> | null = null;

    void (async () => {
      try {
        // Canal privado: se autoriza con el token de la sesión (política en realtime.messages).
        await supabase.realtime.setAuth();
      } catch {
        return;
      }
      if (!vigente) return;
      canal = supabase
        .channel(`chat:${usuarioId}`, { config: { private: true } })
        .on("broadcast", { event: "cambio" }, () => avisar())
        .subscribe((estado) => {
          if (!vigente) return;
          const enLinea = estado === "SUBSCRIBED";
          setConectado(enLinea);
          if (enLinea) avisar();
        });
    })();

    return () => {
      vigente = false;
      if (canal) void supabase.removeChannel(canal);
    };
  }, [usuarioId]);

  return conectado;
}
