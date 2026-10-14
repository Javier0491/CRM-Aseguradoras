import "server-only";

/** Nombre provisional mientras se elige la marca definitiva. */
const NOMBRE_PREDETERMINADO = "Asistente";

/**
 * Nombre con el que se presenta el asistente en todo el CRM: ASISTENTE_NOMBRE (variable de entorno
 * de Vercel, así se cambia sin publicar código) o el provisional.
 */
export function nombreAsistente(): string {
  return process.env.ASISTENTE_NOMBRE?.trim().slice(0, 30) || NOMBRE_PREDETERMINADO;
}

/** Si ya tiene un nombre propio (no el genérico): entonces la IA se presenta con él. */
export const tieneNombrePropio = (nombre: string) => nombre !== NOMBRE_PREDETERMINADO;
