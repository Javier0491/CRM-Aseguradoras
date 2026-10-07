"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { alcanceDe, clientesDe, polizasDe } from "@/lib/auth/alcance";
import { getCurrentUser, type UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatFecha } from "@/lib/format";
import { enviarPush } from "@/lib/notificaciones/push";
import type { Prisma } from "@/lib/generated/prisma/client";
import { tareasVisibles } from "@/lib/tareas/queries";
import { fechaValida, MAX_RESPONSABLES_TAREA, validarTarea, type ErroresTarea } from "@/lib/tareas/reglas";

export type NuevaTareaInput = {
  titulo: string;
  descripcion?: string;
  vence: string;
  /** Encargados (ids): [] = sin encargados; ausente = quien la crea. */
  responsables?: string[];
  clienteId?: string;
  polizaId?: string;
};

export type TareaResultado = { ok: true } | { ok: false; error?: string; errores?: ErroresTarea };
/** Al crear, el id de la tarea nueva. */
export type TareaCreada = { ok: true; id: string } | Extract<TareaResultado, { ok: false }>;

const SESION = "Tu sesión expiró. Vuelve a iniciar sesión.";
const ID = /^[a-z0-9]+$/i;
const ID_USUARIO = /^[\w-]{1,64}$/;
/** Lapso para "Deshacer" un borrado. */
const MINUTOS_RECUPERAR = 60;

function revalidar(clienteId?: string | null, polizaId?: string | null) {
  revalidatePath("/tareas");
  revalidatePath("/");
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  if (polizaId) revalidatePath(`/polizas/${polizaId}`);
}

/** Encargados válidos: cuentas activas del equipo de la agencia (sin repetir). */
async function resolverResponsables(
  user: UsuarioSesion,
  raw: unknown
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  let ids: string[];
  if (raw === undefined) {
    // Sin elegir, la tarea es de quien la crea (si es del equipo de la agencia).
    const delEquipo = !user.superadmin && user.agenciaPropiaId === user.agenciaId;
    ids = delEquipo ? [user.id] : [];
  } else {
    if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || !ID_USUARIO.test(v))) {
      return { ok: false, error: "Encargados inválidos." };
    }
    ids = [...new Set(raw as string[])];
  }
  // Un ejecutivo que solo ve su cartera siempre queda entre los encargados de lo que crea.
  if (user.soloSuCartera && !ids.includes(user.id)) ids.push(user.id);
  if (ids.length > MAX_RESPONSABLES_TAREA) return { ok: false, error: `Máximo ${MAX_RESPONSABLES_TAREA} encargados.` };
  if (ids.length === 0) return { ok: true, ids };
  const activos = await db.usuario.count({
    where: { id: { in: ids }, agenciaId: user.agenciaId, activo: true, rolSistema: "USER" },
  });
  return activos === ids.length
    ? { ok: true, ids }
    : { ok: false, error: "Alguno de los encargados ya no está activo en la agencia; vuelve a elegirlos." };
}

/**
 * Deja la tarea hecha cuando todos sus encargados terminaron (o la reabre si alguno no). Sin
 * encargados no cambia: esa la marca quien la complete.
 */
async function recalcularEstado(tx: Prisma.TransactionClient, tareaId: string, user: UsuarioSesion) {
  const partes = await tx.tareaResponsable.findMany({ where: { tareaId }, select: { completadaAt: true } });
  if (partes.length === 0) return;
  const hecha = partes.every((p) => p.completadaAt !== null);
  await tx.tarea.update({
    where: { id: tareaId, agenciaId: user.agenciaId },
    data: hecha
      ? { completadaAt: new Date(), completadaPorEmail: user.email }
      : { completadaAt: null, completadaPorEmail: null },
  });
}

/** Crea una tarea con sus encargados, opcionalmente de un cliente o una póliza que la sesión pueda ver. */
export async function crearTarea(raw: NuevaTareaInput): Promise<TareaCreada> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Datos inválidos." };
  const datos = {
    titulo: typeof raw.titulo === "string" ? raw.titulo.trim().replace(/\s+/g, " ") : "",
    descripcion: typeof raw.descripcion === "string" ? raw.descripcion.trim() : "",
    vence: typeof raw.vence === "string" ? raw.vence : "",
  };
  const errores = validarTarea(datos);
  if (Object.keys(errores).length > 0) return { ok: false, errores };

  const responsables = await resolverResponsables(user, raw.responsables);
  if (!responsables.ok) return { ok: false, error: responsables.error };

  const alcance = alcanceDe(user);
  let clienteId: string | null = null;
  let polizaId: string | null = null;
  if (raw.polizaId !== undefined) {
    if (typeof raw.polizaId !== "string" || !ID.test(raw.polizaId)) return { ok: false, error: "Póliza inválida." };
    const poliza = await db.poliza.findFirst({
      where: { id: raw.polizaId, ...polizasDe(alcance) },
      select: { id: true, cliente_id: true },
    });
    if (!poliza) return { ok: false, error: "La póliza ya no existe." };
    polizaId = poliza.id;
    clienteId = poliza.cliente_id;
  } else if (raw.clienteId !== undefined) {
    if (typeof raw.clienteId !== "string" || !ID.test(raw.clienteId)) return { ok: false, error: "Cliente inválido." };
    const cliente = await db.cliente.findFirst({
      where: { AND: [{ id: raw.clienteId }, clientesDe(alcance)] },
      select: { id: true },
    });
    if (!cliente) return { ok: false, error: "El cliente ya no existe." };
    clienteId = cliente.id;
  }

  const tarea = await db.tarea.create({
    data: {
      agenciaId: user.agenciaId,
      titulo: datos.titulo,
      descripcion: datos.descripcion || null,
      vence: new Date(`${datos.vence}T00:00:00Z`),
      clienteId,
      polizaId,
      creadaPorEmail: user.email,
      responsables: {
        create: responsables.ids.map((usuarioId) => ({ usuarioId, agenciaId: user.agenciaId })),
      },
    },
    select: { id: true },
  });
  revalidar(clienteId, polizaId);
  // Aviso a los encargados (aunque no tengan el CRM abierto); a quien la creó no.
  const avisar = responsables.ids.filter((id) => id !== user.id);
  if (avisar.length > 0) {
    after(() =>
      enviarPush(avisar, {
        titulo: `Nueva tarea de ${user.nombre ?? "tu equipo"}`,
        cuerpo: `${datos.titulo} · vence el ${formatFecha(`${datos.vence}T00:00:00Z`)}`,
        url: "/tareas",
        etiqueta: `tarea-${tarea.id}`,
      })
    );
  }
  return { ok: true, id: tarea.id };
}

/**
 * Marca o desmarca la parte de quien está en sesión. Una tarea sin encargados la marca
 * cualquiera que la vea. La tarea queda hecha cuando todos sus encargados terminaron.
 */
export async function cambiarEstadoTarea(tareaId: string, completada: boolean): Promise<TareaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof tareaId !== "string" || !ID.test(tareaId) || typeof completada !== "boolean") {
    return { ok: false, error: "Datos inválidos." };
  }
  const tarea = await db.tarea.findFirst({
    where: { AND: [{ id: tareaId }, tareasVisibles(user)] },
    select: { clienteId: true, polizaId: true, responsables: { select: { usuarioId: true } } },
  });
  if (!tarea) return { ok: false, error: "La tarea ya no existe." };

  if (tarea.responsables.length === 0) {
    await db.tarea.update({
      where: { id: tareaId, agenciaId: user.agenciaId },
      data: completada
        ? { completadaAt: new Date(), completadaPorEmail: user.email }
        : { completadaAt: null, completadaPorEmail: null },
    });
  } else {
    if (!tarea.responsables.some((r) => r.usuarioId === user.id)) {
      return { ok: false, error: "Solo sus encargados marcan su parte." };
    }
    await db.$transaction(async (tx) => {
      await tx.tareaResponsable.update({
        where: { tareaId_usuarioId: { tareaId, usuarioId: user.id } },
        data: { completadaAt: completada ? new Date() : null },
      });
      await recalcularEstado(tx, tareaId, user);
    });
  }
  revalidar(tarea.clienteId, tarea.polizaId);
  return { ok: true };
}

/** Quien coordina (Administrador, Líder de oficina) marca o desmarca la parte de otro encargado. */
export async function marcarParteTarea(tareaId: string, usuarioId: string, completada: boolean): Promise<TareaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (
    typeof tareaId !== "string" ||
    !ID.test(tareaId) ||
    typeof usuarioId !== "string" ||
    !ID_USUARIO.test(usuarioId) ||
    typeof completada !== "boolean"
  ) {
    return { ok: false, error: "Datos inválidos." };
  }
  if (usuarioId !== user.id && !user.coordinaTareas) {
    return { ok: false, error: "Solo el Administrador o el Líder de oficina marcan la parte de otros." };
  }
  const parte = await db.tareaResponsable.findFirst({
    where: { tareaId, usuarioId, tarea: tareasVisibles(user) },
    select: { tarea: { select: { clienteId: true, polizaId: true } } },
  });
  if (!parte) return { ok: false, error: "La tarea ya no existe." };
  await db.$transaction(async (tx) => {
    await tx.tareaResponsable.update({
      where: { tareaId_usuarioId: { tareaId, usuarioId } },
      data: { completadaAt: completada ? new Date() : null },
    });
    await recalcularEstado(tx, tareaId, user);
  });
  revalidar(parte.tarea.clienteId, parte.tarea.polizaId);
  return { ok: true };
}

/** Cambia la fecha de una tarea pendiente (posponerla o adelantarla). */
export async function cambiarFechaTarea(tareaId: string, vence: string): Promise<TareaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof tareaId !== "string" || !ID.test(tareaId) || typeof vence !== "string" || !fechaValida(vence)) {
    return { ok: false, error: "Fecha inválida." };
  }
  const tarea = await db.tarea.findFirst({
    where: { AND: [{ id: tareaId }, tareasVisibles(user)] },
    select: { clienteId: true, polizaId: true, completadaAt: true },
  });
  if (!tarea) return { ok: false, error: "La tarea ya no existe." };
  if (tarea.completadaAt) return { ok: false, error: "La tarea ya está completada." };
  await db.tarea.update({
    where: { id: tareaId, agenciaId: user.agenciaId },
    data: { vence: new Date(`${vence}T00:00:00Z`) },
  });
  revalidar(tarea.clienteId, tarea.polizaId);
  return { ok: true };
}

/** Quién puede borrar: quien la creó, quien coordina o, si es su único encargado, ese encargado. */
function puedeBorrar(
  user: UsuarioSesion,
  tarea: { creadaPorEmail: string | null; responsables: { usuarioId: string }[] }
) {
  const creador = user.email !== null && tarea.creadaPorEmail?.toLowerCase() === user.email.toLowerCase();
  const unicoEncargado = tarea.responsables.length === 1 && tarea.responsables[0].usuarioId === user.id;
  return creador || unicoEncargado || user.coordinaTareas;
}

/** Borra una tarea (borrado suave: "Deshacer" la recupera tal cual durante una hora). */
export async function eliminarTarea(tareaId: string): Promise<TareaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof tareaId !== "string" || !ID.test(tareaId)) return { ok: false, error: "Datos inválidos." };
  const tarea = await db.tarea.findFirst({
    where: { AND: [{ id: tareaId }, tareasVisibles(user)] },
    select: { clienteId: true, polizaId: true, creadaPorEmail: true, responsables: { select: { usuarioId: true } } },
  });
  if (!tarea) return { ok: false, error: "La tarea ya no existe." };
  if (!puedeBorrar(user, tarea)) {
    return { ok: false, error: "Solo quien la creó, su único encargado o quien coordina el equipo la pueden borrar." };
  }
  await db.tarea.update({ where: { id: tareaId, agenciaId: user.agenciaId }, data: { eliminadaAt: new Date() } });
  revalidar(tarea.clienteId, tarea.polizaId);
  return { ok: true };
}

/** "Deshacer" de un borrado: la tarea vuelve con sus encargados y su avance. */
export async function restaurarTarea(tareaId: string): Promise<TareaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof tareaId !== "string" || !ID.test(tareaId)) return { ok: false, error: "Datos inválidos." };
  const tarea = await db.tarea.findFirst({
    where: {
      id: tareaId,
      agenciaId: user.agenciaId,
      eliminadaAt: { gte: new Date(Date.now() - MINUTOS_RECUPERAR * 60_000) },
    },
    select: { clienteId: true, polizaId: true, creadaPorEmail: true, responsables: { select: { usuarioId: true } } },
  });
  if (!tarea || !puedeBorrar(user, tarea)) return { ok: false, error: "Ya no se puede recuperar esta tarea." };
  await db.tarea.update({ where: { id: tareaId, agenciaId: user.agenciaId }, data: { eliminadaAt: null } });
  revalidar(tarea.clienteId, tarea.polizaId);
  return { ok: true };
}
