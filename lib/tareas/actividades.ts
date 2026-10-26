// Actividades de póliza: pendientes con tipo (cambio de agente, …) que se anotan al capturar o
// renovar una póliza y se recuerdan con insistencia hasta finalizarlas. Son tareas con `tipo`.
// Funciones puras, compartidas por cliente y servidor.

import { MAX_DESCRIPCION_TAREA, MAX_TITULO_TAREA } from "@/lib/tareas/reglas";

export const TIPOS_ACTIVIDAD = [
  { value: "cambio_agente", label: "Cambio de agente" },
  { value: "cambio_forma_pago", label: "Cambio de forma de pago" },
  { value: "cambio_conducto", label: "Cambio de conducto de cobro" },
  { value: "endoso", label: "Endoso pendiente" },
  { value: "documentos", label: "Documentos pendientes" },
  { value: "entrega_poliza", label: "Entrega de póliza" },
  { value: "otro", label: "Otro" },
] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number]["value"];

export const esTipoActividad = (v: unknown): v is TipoActividad =>
  typeof v === "string" && TIPOS_ACTIVIDAD.some((t) => t.value === v);

export const etiquetaActividad = (tipo: string) => TIPOS_ACTIVIDAD.find((t) => t.value === tipo)?.label ?? "Actividad";

/** Cada cuánto se recuerdan las actividades pendientes mientras el CRM está abierto. */
export const MINUTOS_RECORDATORIO_ACTIVIDADES = 5;
/** Evento de la ventana tras finalizar, reabrir o borrar una tarea: el recordatorio se actualiza. */
export const EVENTO_ACTIVIDADES = "actividades-cambiaron";
/** Actividades que se pueden anotar al capturar una póliza. */
export const MAX_ACTIVIDADES_CAPTURA = 10;

export type ActividadCaptura = { tipo: TipoActividad | ""; comentario: string };

/** Error de una actividad del formulario de captura, o null si es válida. */
export function validarActividad(a: ActividadCaptura): string | null {
  if (!a.tipo) return "Elige el tipo de actividad.";
  const comentario = a.comentario.trim();
  if (a.tipo === "otro" && !comentario) return "Escribe qué hay que hacer.";
  if (comentario.length > MAX_DESCRIPCION_TAREA) return `Máximo ${MAX_DESCRIPCION_TAREA} caracteres.`;
  return null;
}

/**
 * Título de la tarea de una actividad: el tipo ("Cambio de agente"); en "Otro", el comentario.
 * El comentario va completo en la descripción.
 */
export function tituloActividad(tipo: TipoActividad, comentario: string) {
  const limpio = comentario.trim().replace(/\s+/g, " ");
  if (tipo !== "otro") return etiquetaActividad(tipo);
  return limpio.length > MAX_TITULO_TAREA ? `${limpio.slice(0, MAX_TITULO_TAREA - 1)}…` : limpio;
}

/**
 * Actividades de un payload no confiable (captura de póliza). null si la forma es inválida o
 * alguna actividad no pasa la validación; [] si no trae.
 */
export function leerActividades(raw: unknown): { tipo: TipoActividad; comentario: string }[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ACTIVIDADES_CAPTURA) return null;
  const actividades: { tipo: TipoActividad; comentario: string }[] = [];
  for (const a of raw) {
    if (typeof a !== "object" || a === null) return null;
    const { tipo, comentario } = a as Record<string, unknown>;
    if (!esTipoActividad(tipo) || (comentario !== undefined && typeof comentario !== "string")) return null;
    const actividad = { tipo, comentario: (comentario ?? "").trim() };
    if (validarActividad(actividad)) return null;
    actividades.push(actividad);
  }
  return actividades;
}
