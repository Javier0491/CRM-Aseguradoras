"use client";

import * as React from "react";

import { MAX_CARACTERES_MENSAJE, type EventoAsistente, type MensajeAsistente } from "@/lib/asistente/types";

export type Mensaje = MensajeAsistente & { id: number; error?: boolean };

/** Lo que hace el personaje: lo deciden la conversación y el streaming de la respuesta. */
export type EstadoPersonaje = "reposo" | "pensando" | "hablando";

type Estado = {
  mensajes: Mensaje[];
  pensando: boolean;
  /** Consulta a la cartera en curso ("Buscando pólizas"), o null. */
  consulta: string | null;
};

/**
 * La conversación vive fuera de los componentes: la comparten el panel flotante y la página del
 * asistente, y una respuesta sigue llegando aunque el usuario cambie de pantalla. Se pierde al
 * recargar: no se guarda nada con datos de clientes en el navegador.
 */
const VACIO: Estado = { mensajes: [], pensando: false, consulta: null };
let estado: Estado = VACIO;
let siguienteId = 1;
const suscriptores = new Set<() => void>();

function actualizar(cambio: Partial<Estado> | ((e: Estado) => Partial<Estado>)) {
  estado = { ...estado, ...(typeof cambio === "function" ? cambio(estado) : cambio) };
  for (const avisar of suscriptores) avisar();
}

function suscribir(avisar: () => void) {
  suscriptores.add(avisar);
  return () => suscriptores.delete(avisar);
}

export function useConversacion() {
  // En el servidor (y al hidratar) la conversación está vacía; luego toma la del navegador.
  return React.useSyncExternalStore(suscribir, () => estado, () => VACIO);
}

/** Reposo, pensando (esperando la respuesta o consultando la cartera) o hablando (llega texto). */
export function estadoPersonaje(e: Estado): EstadoPersonaje {
  if (!e.pensando) return "reposo";
  const ultimo = e.mensajes[e.mensajes.length - 1];
  return e.consulta || ultimo?.rol === "usuario" ? "pensando" : "hablando";
}

export function nuevaConversacion() {
  if (estado.pensando) return;
  actualizar({ mensajes: [] });
}

export async function preguntar(texto: string) {
  const pregunta = texto.trim().slice(0, MAX_CARACTERES_MENSAJE);
  if (!pregunta || estado.pensando) return;
  const nueva: Mensaje = { id: siguienteId++, rol: "usuario", texto: pregunta };
  const respuestaId = siguienteId++;
  const historial = [...estado.mensajes.filter((m) => !m.error), nueva];
  actualizar((e) => ({ mensajes: [...e.mensajes, nueva].slice(-40), pensando: true, consulta: null }));

  const agregarTexto = (fragmento: string) =>
    actualizar((e) => ({
      consulta: null,
      mensajes: e.mensajes.some((m) => m.id === respuestaId)
        ? e.mensajes.map((m) => (m.id === respuestaId ? { ...m, texto: m.texto + fragmento } : m))
        : [...e.mensajes, { id: respuestaId, rol: "asistente", texto: fragmento }],
    }));
  const fallar = (error: string) =>
    actualizar((e) => ({
      mensajes: [
        ...e.mensajes.filter((m) => m.id !== respuestaId || m.texto),
        { id: siguienteId++, rol: "asistente", texto: error, error: true },
      ],
    }));

  try {
    const res = await fetch("/api/asistente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensajes: historial.map(({ rol, texto }) => ({ rol, texto })) }),
    });
    if (!res.ok || !res.body) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
      fallar(cuerpo?.error ?? "No pude responder en este momento. Intenta de nuevo.");
      return;
    }
    const lector = res.body.getReader();
    const decoder = new TextDecoder();
    let pendiente = "";
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      pendiente += decoder.decode(value, { stream: true });
      const lineas = pendiente.split("\n");
      pendiente = lineas.pop() ?? "";
      for (const linea of lineas) {
        if (!linea.trim()) continue;
        const evento = JSON.parse(linea) as EventoAsistente;
        if (evento.tipo === "texto") agregarTexto(evento.texto);
        else if (evento.tipo === "herramienta") actualizar({ consulta: evento.etiqueta });
        else if (evento.tipo === "error") fallar(evento.error);
      }
    }
  } catch {
    fallar("Se perdió la conexión. Revisa tu internet e intenta de nuevo.");
  } finally {
    actualizar({ pensando: false, consulta: null });
  }
}
