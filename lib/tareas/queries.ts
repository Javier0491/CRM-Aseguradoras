import "server-only";

import { connection } from "next/server";

import { alcanceDe, clientesDe, polizasDe, type Alcance } from "@/lib/auth/alcance";
import { requireUser, type UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";

export const LIMITE_TAREAS = 200;

const SELECT_TAREA = {
  id: true,
  titulo: true,
  descripcion: true,
  vence: true,
  completadaAt: true,
  completadaPorEmail: true,
  creadaPorEmail: true,
  responsable: { select: { id: true, nombre: true } },
  cliente: { select: { id: true, nombre: true } },
  poliza: { select: { id: true, numeroImpreso: true } },
} as const satisfies Prisma.TareaSelect;

export type TareaListado = Prisma.TareaGetPayload<{ select: typeof SELECT_TAREA }>;

/**
 * Tareas que ve la sesión: todas las de la agencia, salvo un ejecutivo que solo ve su cartera
 * (las suyas y las de sus clientes y pólizas).
 */
export function tareasVisibles(user: UsuarioSesion): Prisma.TareaWhereInput {
  const alcance: Alcance = alcanceDe(user);
  if (!alcance.ejecutivoId) return { agenciaId: alcance.agenciaId };
  return {
    agenciaId: alcance.agenciaId,
    OR: [
      { responsableId: user.id },
      { cliente: clientesDe(alcance) },
      { poliza: polizasDe(alcance) },
    ],
  };
}

export type VistaTareas = "mias" | "todas" | "completadas";
export const esVistaTareas = (v: unknown): v is VistaTareas => v === "mias" || v === "todas" || v === "completadas";

/** Listado de la página de tareas: pendientes (mías o todas) o las completadas recientes. */
export async function getTareas(vista: VistaTareas) {
  await connection();
  const user = await requireUser();
  const visibles = tareasVisibles(user);
  const where: Prisma.TareaWhereInput = {
    AND: [
      visibles,
      vista === "completadas" ? { completadaAt: { not: null } } : { completadaAt: null },
      vista === "mias" ? { responsableId: user.id } : {},
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

/** Tareas pendientes de un cliente o de una póliza (para su expediente). */
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

/** Mis pendientes vencidos y de hoy (dashboard y campana). */
export async function getMisPendientesHoy(user: UsuarioSesion, limite = 8) {
  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const where: Prisma.TareaWhereInput = {
    agenciaId: user.agenciaId,
    responsableId: user.id,
    completadaAt: null,
    vence: { lte: hoy },
  };
  const [tareas, total] = await Promise.all([
    db.tarea.findMany({ where, orderBy: [{ vence: "asc" }, { createdAt: "asc" }], take: limite, select: SELECT_TAREA }),
    db.tarea.count({ where }),
  ]);
  return { tareas, total };
}
