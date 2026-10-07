// Tareas y recordatorios: validación y agrupación (compartidas por cliente y servidor).

export const MAX_TITULO_TAREA = 140;
export const MAX_DESCRIPCION_TAREA = 1000;
export const MAX_RESPONSABLES_TAREA = 20;

/**
 * Avance de una tarea por sus encargados: cuántos terminaron su parte, de cuántos, y el
 * porcentaje redondeado. Sin encargados, el avance es la tarea misma (0 % o 100 %).
 */
export function avanceTarea(partes: readonly { hecha: boolean }[], completada: boolean) {
  if (partes.length === 0) return { hechas: completada ? 1 : 0, total: 1, porcentaje: completada ? 100 : 0 };
  const hechas = partes.filter((p) => p.hecha).length;
  return { hechas, total: partes.length, porcentaje: Math.round((hechas / partes.length) * 100) };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function fechaValida(v: string) {
  if (!FECHA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

export type DatosTarea = { titulo: string; descripcion: string; vence: string };
export type ErroresTarea = Partial<Record<keyof DatosTarea, string>>;

/** Errores del formulario de una tarea (vacío si es válida). */
export function validarTarea(d: DatosTarea): ErroresTarea {
  const errores: ErroresTarea = {};
  const titulo = d.titulo.trim();
  if (!titulo) errores.titulo = "Escribe qué hay que hacer.";
  else if (titulo.length > MAX_TITULO_TAREA) errores.titulo = `Máximo ${MAX_TITULO_TAREA} caracteres.`;
  if (d.descripcion.length > MAX_DESCRIPCION_TAREA) errores.descripcion = `Máximo ${MAX_DESCRIPCION_TAREA} caracteres.`;
  if (!fechaValida(d.vence)) errores.vence = "Elige la fecha.";
  return errores;
}

export type GrupoTarea = "vencida" | "hoy" | "proxima" | "completada";

export const GRUPOS_TAREA: { clave: GrupoTarea; titulo: string }[] = [
  { clave: "vencida", titulo: "Vencidas" },
  { clave: "hoy", titulo: "Para hoy" },
  { clave: "proxima", titulo: "Próximas" },
  { clave: "completada", titulo: "Completadas" },
];

/** Grupo de una tarea al día `hoy` (YYYY-MM-DD). */
export function grupoTarea(t: { vence: string; completada: boolean }, hoy: string): GrupoTarea {
  if (t.completada) return "completada";
  if (t.vence < hoy) return "vencida";
  return t.vence === hoy ? "hoy" : "proxima";
}

/** Atajos de fecha del formulario: hoy, mañana, en una semana. */
export function sumarDiasIso(fecha: string, dias: number) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}
