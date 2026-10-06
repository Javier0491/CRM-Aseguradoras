"use server";

import { revalidatePath } from "next/cache";

import { alcanceDe, clientesDe, polizasDe } from "@/lib/auth/alcance";
import { esAdmin, getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { tareasVisibles } from "@/lib/tareas/queries";
import { fechaValida, validarTarea, type ErroresTarea } from "@/lib/tareas/reglas";
import { leerEjecutivoSolicitado, resolverEjecutivo } from "@/lib/usuarios/asignacion";

export type NuevaTareaInput = {
  titulo: string;
  descripcion?: string;
  vence: string;
  /** Responsable: id, "" (sin asignar) o ausente (quien la crea). */
  ejecutivoId?: string;
  clienteId?: string;
  polizaId?: string;
};

export type TareaResultado = { ok: true } | { ok: false; error?: string; errores?: ErroresTarea };

const SESION = "Tu sesión expiró. Vuelve a iniciar sesión.";
const ID = /^[a-z0-9]+$/i;

function revalidar(clienteId?: string | null, polizaId?: string | null) {
  revalidatePath("/tareas");
  revalidatePath("/");
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  if (polizaId) revalidatePath(`/polizas/${polizaId}`);
}

/** Crea una tarea, opcionalmente de un cliente o una póliza que la sesión pueda ver. */
export async function crearTarea(raw: NuevaTareaInput): Promise<TareaResultado> {
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

  // Sin responsable elegido, la tarea es de quien la crea (si es del equipo de la agencia).
  const responsable = await resolverEjecutivo(user, leerEjecutivoSolicitado(raw));
  if (!responsable.ok) return { ok: false, error: responsable.error };

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

  await db.tarea.create({
    data: {
      agenciaId: user.agenciaId,
      titulo: datos.titulo,
      descripcion: datos.descripcion || null,
      vence: new Date(`${datos.vence}T00:00:00Z`),
      responsableId: responsable.ejecutivoId,
      clienteId,
      polizaId,
      creadaPorEmail: user.email,
    },
  });
  revalidar(clienteId, polizaId);
  return { ok: true };
}

/** Marca una tarea como hecha o la vuelve a abrir. */
export async function cambiarEstadoTarea(tareaId: string, completada: boolean): Promise<TareaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof tareaId !== "string" || !ID.test(tareaId) || typeof completada !== "boolean") {
    return { ok: false, error: "Datos inválidos." };
  }
  const tarea = await db.tarea.findFirst({
    where: { AND: [{ id: tareaId }, tareasVisibles(user)] },
    select: { clienteId: true, polizaId: true },
  });
  if (!tarea) return { ok: false, error: "La tarea ya no existe." };
  await db.tarea.update({
    where: { id: tareaId, agenciaId: user.agenciaId },
    data: completada
      ? { completadaAt: new Date(), completadaPorEmail: user.email }
      : { completadaAt: null, completadaPorEmail: null },
  });
  revalidar(tarea.clienteId, tarea.polizaId);
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

/** Borra una tarea: solo quien la creó, su responsable o un administrador. */
export async function eliminarTarea(tareaId: string): Promise<TareaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESION };
  if (typeof tareaId !== "string" || !ID.test(tareaId)) return { ok: false, error: "Datos inválidos." };
  const tarea = await db.tarea.findFirst({
    where: { AND: [{ id: tareaId }, tareasVisibles(user)] },
    select: { clienteId: true, polizaId: true, responsableId: true, creadaPorEmail: true },
  });
  if (!tarea) return { ok: false, error: "La tarea ya no existe." };
  const propia =
    tarea.responsableId === user.id ||
    (user.email !== null && tarea.creadaPorEmail?.toLowerCase() === user.email.toLowerCase());
  if (!propia && !esAdmin(user)) return { ok: false, error: "Solo quien la creó, su responsable o un administrador la pueden borrar." };
  await db.tarea.delete({ where: { id: tareaId, agenciaId: user.agenciaId } });
  revalidar(tarea.clienteId, tarea.polizaId);
  return { ok: true };
}
