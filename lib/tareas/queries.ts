import "server-only";

import { connection } from "next/server";

import { alcanceDe, clientesDe, polizasDe } from "@/lib/auth/alcance";
import { requireUser, type UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { hoyISO, inicioDeHoy } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";

export const LIMITE_TAREAS = 200;
const DIA_MS = 86_400_000;

const SELECT_TAREA = {
  id: true,
  titulo: true,
  descripcion: true,
  vence: true,
  completadaAt: true,
  completadaPorEmail: true,
  creadaPorEmail: true,
  responsables: {
    orderBy: { usuario: { nombre: "asc" } },
    select: { usuarioId: true, completadaAt: true, usuario: { select: { nombre: true } } },
  },
  cliente: { select: { id: true, nombre: true } },
  poliza: { select: { id: true, numeroImpreso: true } },
} as const satisfies Prisma.TareaSelect;

export type TareaListado = Prisma.TareaGetPayload<{ select: typeof SELECT_TAREA }>;

/**
 * Tareas que ve la sesión (sin las borradas): quien coordina (Administrador, Líder de oficina) y
 * quien opera toda la cartera, todas las de la agencia; un ejecutivo que solo ve su cartera, las
 * suyas y las de sus clientes y pólizas; la Ejecutiva de operación y el Auxiliar, las suyas y las
 * que crearon.
 */
export function tareasVisibles(user: UsuarioSesion): Prisma.TareaWhereInput {
  const base = { agenciaId: user.agenciaId, eliminadaAt: null };
  const mias: Prisma.TareaWhereInput = { responsables: { some: { usuarioId: user.id } } };
  if (user.coordinaTareas) return base;
  if (user.soloTareas) {
    return {
      ...base,
      OR: [mias, ...(user.email ? [{ creadaPorEmail: { equals: user.email, mode: "insensitive" as const } }] : [])],
    };
  }
  if (!user.soloSuCartera) return base;
  const alcance = alcanceDe(user);
  return { ...base, OR: [mias, { cliente: clientesDe(alcance) }, { poliza: polizasDe(alcance) }] };
}

/** Mis tareas con mi parte pendiente. */
const conMiPartePendiente = (user: UsuarioSesion): Prisma.TareaWhereInput => ({
  responsables: { some: { usuarioId: user.id, completadaAt: null } },
});

export type VistaTareas = "mias" | "todas" | "completadas";
export const esVistaTareas = (v: unknown): v is VistaTareas => v === "mias" || v === "todas" || v === "completadas";

/** Listado de la página de tareas: mis pendientes, los del equipo o las completadas recientes. */
export async function getTareas(vista: VistaTareas) {
  await connection();
  const user = await requireUser();
  const where: Prisma.TareaWhereInput = {
    AND: [
      tareasVisibles(user),
      vista === "completadas" ? { completadaAt: { not: null } } : { completadaAt: null },
      vista === "mias" ? conMiPartePendiente(user) : {},
    ],
  };
  const [tareas, total] = await Promise.all([
    db.tarea.findMany({
      where,
      orderBy: vista === "completadas" ? [{ completadaAt: "desc" }] : [{ vence: "asc" }, { createdAt: "asc" }],
      take: LIMITE_TAREAS,
      select: SELECT_TAREA,
    }),
    db.tarea.count({ where }),
  ]);
  return { tareas, total };
}

/** Tareas de un cliente o de una póliza (para su expediente). */
export async function getTareasDe(filtro: { clienteId: string } | { polizaId: string }) {
  await connection();
  const user = await requireUser();
  return db.tarea.findMany({
    where: { AND: [tareasVisibles(user), filtro] },
    orderBy: [{ completadaAt: { sort: "desc", nulls: "first" } }, { vence: "asc" }],
    take: 50,
    select: SELECT_TAREA,
  });
}

/** Mis pendientes vencidos y de hoy (dashboard): tareas con mi parte sin hacer. */
export async function getMisPendientesHoy(user: UsuarioSesion, limite = 8) {
  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const where: Prisma.TareaWhereInput = {
    agenciaId: user.agenciaId,
    eliminadaAt: null,
    completadaAt: null,
    vence: { lte: hoy },
    ...conMiPartePendiente(user),
  };
  const [tareas, total] = await Promise.all([
    db.tarea.findMany({ where, orderBy: [{ vence: "asc" }, { createdAt: "asc" }], take: limite, select: SELECT_TAREA }),
    db.tarea.count({ where }),
  ]);
  return { tareas, total };
}

/**
 * Resumen de mis tareas para el encabezado de Tareas: pendientes, vencidas, de hoy, hechas hoy
 * (para el avance del día) y hechas en 7 días.
 */
export async function getMiResumen(user: UsuarioSesion) {
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const empezoHoy = inicioDeHoy();
  const mias = { usuarioId: user.id, tarea: { agenciaId: user.agenciaId, eliminadaAt: null } };
  const [pendientes, vencidas, deHoy, hechasHoy, hechas] = await Promise.all([
    db.tareaResponsable.count({ where: { ...mias, completadaAt: null } }),
    db.tareaResponsable.count({ where: { ...mias, completadaAt: null, tarea: { ...mias.tarea, vence: { lt: hoy } } } }),
    db.tareaResponsable.count({ where: { ...mias, completadaAt: null, tarea: { ...mias.tarea, vence: hoy } } }),
    db.tareaResponsable.count({ where: { ...mias, completadaAt: { gte: empezoHoy } } }),
    db.tareaResponsable.count({ where: { ...mias, completadaAt: { gte: new Date(empezoHoy.getTime() - 6 * DIA_MS) } } }),
  ]);
  return { pendientes, vencidas, deHoy, hechasHoy, hechas };
}
export type MiResumenTareas = Awaited<ReturnType<typeof getMiResumen>>;

export type AvancePersona = {
  id: string;
  nombre: string;
  rol: string;
  pendientes: number;
  vencidas: number;
  /** Partes terminadas en los últimos 30 días. */
  hechas: number;
};

/**
 * Avance de cada persona del equipo (para quien coordina): sus partes pendientes, cuántas ya
 * vencieron y cuántas terminó en los últimos 30 días.
 */
export async function getAvanceEquipo(user: UsuarioSesion): Promise<AvancePersona[]> {
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const [equipo, partes] = await Promise.all([
    db.usuario.findMany({
      where: { agenciaId: user.agenciaId, activo: true, rolSistema: "USER" },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, rol: true },
    }),
    db.tareaResponsable.findMany({
      where: {
        agenciaId: user.agenciaId,
        tarea: { eliminadaAt: null },
        OR: [{ completadaAt: null }, { completadaAt: { gte: new Date(hoy.getTime() - 30 * DIA_MS) } }],
      },
      select: { usuarioId: true, completadaAt: true, tarea: { select: { vence: true } } },
    }),
  ]);
  return equipo.map((p) => {
    const suyas = partes.filter((x) => x.usuarioId === p.id);
    const pendientes = suyas.filter((x) => x.completadaAt === null);
    return {
      ...p,
      pendientes: pendientes.length,
      vencidas: pendientes.filter((x) => x.tarea.vence < hoy).length,
      hechas: suyas.length - pendientes.length,
    };
  });
}
