// Contrato entre el chat del asistente y /api/asistente.

export type MensajeAsistente = { rol: "usuario" | "asistente"; texto: string };

/** La respuesta llega como líneas JSON (NDJSON), una por evento. */
export type EventoAsistente =
  | { tipo: "texto"; texto: string }
  | { tipo: "herramienta"; etiqueta: string }
  | { tipo: "error"; error: string }
  | { tipo: "fin" };

/** Mensajes previos que se mandan como contexto y largo máximo de cada uno. */
export const MAX_HISTORIAL = 20;
export const MAX_CARACTERES_MENSAJE = 4_000;
