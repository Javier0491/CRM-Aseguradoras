"use server";

import { revalidatePath } from "next/cache";

import { CLAIM_AGENCIA } from "@/lib/agencias/constantes";
import { getAdmin, type UsuarioSesion } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { faltaCupoUsuarios, LimitePlanError } from "@/lib/planes/limites";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_PASSWORD, MIN_PASSWORD, ROLES, ROLES_CARTERA, rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";

export type NuevoUsuarioInput = {
  nombre: string;
  email: string;
  password: string;
  rol: RolUsuario;
  /** Solo SUPERADMIN: agencia donde se crea la cuenta. Sin él, la agencia de la sesión. */
  agenciaId?: string;
};

export type ResultadoUsuario =
  | { ok: true }
  | { ok: false; error: string; campo?: keyof NuevoUsuarioInput };

const EMAIL_VALIDO = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

function validar(raw: unknown): { ok: true; datos: NuevoUsuarioInput } | Extract<ResultadoUsuario, { ok: false }> {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Datos inválidos." };
  const { nombre, email, password, rol } = raw as Record<string, unknown>;
  const nombreLimpio = typeof nombre === "string" ? nombre.trim().replace(/\s+/g, " ") : "";
  if (nombreLimpio.length < 2 || nombreLimpio.length > 100) {
    return { ok: false, error: "Escribe el nombre (entre 2 y 100 caracteres).", campo: "nombre" };
  }
  const emailLimpio = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL_VALIDO.test(emailLimpio) || emailLimpio.length > 254) {
    return { ok: false, error: "Escribe un correo válido.", campo: "email" };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`, campo: "password" };
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return { ok: false, error: `La contraseña admite como máximo ${MAX_PASSWORD} caracteres.`, campo: "password" };
  }
  if (typeof rol !== "string" || !(ROLES as readonly string[]).includes(rol)) {
    return { ok: false, error: "Selecciona el rol.", campo: "rol" };
  }
  return { ok: true, datos: { nombre: nombreLimpio, email: emailLimpio, password, rol: rol as RolUsuario } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Agencia donde se crea la cuenta: la de la sesión, salvo que un SUPERADMIN elija otra. El rol
 * viene de la base de datos (getCurrentUser), así que un admin de agencia no puede elegir.
 */
async function agenciaDestino(
  admin: UsuarioSesion,
  elegida: unknown
): Promise<{ ok: true; agenciaId: string } | Extract<ResultadoUsuario, { ok: false }>> {
  if (elegida === undefined || elegida === null || elegida === admin.agenciaId) {
    return { ok: true, agenciaId: admin.agenciaId };
  }
  if (!admin.superadmin) {
    return { ok: false, error: "Solo un superadministrador puede elegir la agencia.", campo: "agenciaId" };
  }
  if (typeof elegida !== "string" || !UUID.test(elegida)) {
    return { ok: false, error: "Agencia inválida.", campo: "agenciaId" };
  }
  const agencia = await db.agencia.findUnique({ where: { id: elegida }, select: { id: true } });
  if (!agencia) return { ok: false, error: "La agencia ya no existe; recarga la página.", campo: "agenciaId" };
  return { ok: true, agenciaId: agencia.id };
}

/**
 * Crea una cuenta del equipo. La contraseña la guarda Supabase Auth con bcrypt: el CRM nunca
 * la almacena. Aquí solo se registra el perfil (nombre y rol) con el mismo id.
 */
export async function crearUsuario(raw: NuevoUsuarioInput): Promise<ResultadoUsuario> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede crear usuarios." };
  const v = validar(raw);
  if (!v.ok) return v;
  const { nombre, email, password, rol } = v.datos;
  const destino = await agenciaDestino(admin, raw.agenciaId);
  if (!destino.ok) return destino;
  const { agenciaId } = destino;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Falta SUPABASE_SECRET_KEY en el servidor para poder crear cuentas." };
  }
  // El correo es único en todo el SaaS (una cuenta de Supabase Auth pertenece a una sola agencia).
  const existente = await db.usuario.findUnique({ where: { email }, select: { activo: true } });
  if (existente) {
    return {
      ok: false,
      error: existente.activo
        ? "Ya existe un usuario con ese correo."
        : "Ya existe un usuario desactivado con ese correo: reactívalo desde la lista.",
      campo: "email",
    };
  }
  // Antes de crear la cuenta en Supabase Auth; la transacción lo vuelve a revisar.
  const sinCupo = await faltaCupoUsuarios(db, agenciaId);
  if (sinCupo) return { ok: false, error: sinCupo };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    // Lo da de alta un administrador: no hace falta confirmar el correo para entrar.
    email_confirm: true,
    user_metadata: { nombre },
    // La cuenta nueva pertenece a la agencia del administrador que la crea (o a la que eligió
    // un SUPERADMIN).
    app_metadata: { [CLAIM_AGENCIA]: agenciaId },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists") {
      return {
        ok: false,
        error: "Ese correo ya tiene una cuenta en Supabase Auth, aunque no aparece en el CRM. Revísala en el panel de Supabase.",
        campo: "email",
      };
    }
    if (error?.code === "weak_password") {
      return { ok: false, error: "La contraseña es demasiado débil. Usa una más larga o variada.", campo: "password" };
    }
    console.error("[crearUsuario] Supabase Auth:", error?.code, error?.message);
    return { ok: false, error: "No se pudo crear la cuenta en Supabase Auth." };
  }

  try {
    await db.$transaction(
      async (tx) => {
        // Serializable: dos altas simultáneas no pueden ocupar ambas el último lugar del plan.
        const falta = await faltaCupoUsuarios(tx, agenciaId);
        if (falta) throw new LimitePlanError(falta);
        await tx.usuario.create({ data: { id: data.user.id, agenciaId, nombre, email, rol } });
        // Queda en la bitácora de la agencia donde se creó la cuenta.
        await registrarBitacora(
          { id: admin.id, email: admin.email, agenciaId },
          { accion: "usuario.crear", entidad: "usuario", entidadId: data.user.id, descripcion: `Creó a ${nombre} (${email}) como ${rolLabels[rol]}` },
          tx
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    // Sin perfil la cuenta quedaría huérfana: se deshace para poder reintentar.
    await supabase.auth.admin.deleteUser(data.user.id);
    if (e instanceof LimitePlanError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return { ok: false, error: "Otra persona agregó usuarios al mismo tiempo. Intenta de nuevo." };
    }
    console.error("[crearUsuario] Perfil:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo registrar el usuario. Intenta de nuevo." };
  }

  revalidatePath("/sistema/usuarios");
  return { ok: true };
}

export type EdicionUsuarioInput = { id: string; nombre: string; rol: RolUsuario };
export type ResultadoEdicion = { ok: true } | { ok: false; error: string; campo?: "nombre" | "rol" };

class ReglaUsuarioError extends Error {}

/**
 * Sin otro administrador activo en la agencia nadie podría volver a entrar a Usuarios ni a la
 * configuración.
 */
async function verificarOtroAdmin(tx: Prisma.TransactionClient, agenciaId: string, excepto: string, accion: string) {
  const otros = await tx.usuario.count({ where: { agenciaId, rol: "ADMIN", activo: true, id: { not: excepto } } });
  if (otros === 0) throw new ReglaUsuarioError(`No se puede ${accion}: es el único administrador activo.`);
}

function errorDeTransaccion(e: unknown, contexto: string): { ok: false; error: string } {
  if (e instanceof ReglaUsuarioError || e instanceof LimitePlanError) return { ok: false, error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return { ok: false, error: "El usuario ya no existe; recarga la página." };
    if (e.code === "P2034") return { ok: false, error: "Otra persona modificó los usuarios al mismo tiempo. Intenta de nuevo." };
  }
  console.error(`[${contexto}]`, e instanceof Error ? e.message : e);
  return { ok: false, error: "No se pudo guardar el cambio." };
}

/** Cambia el nombre y el rol de una cuenta. Un admin no puede quitarse el rol a sí mismo. */
export async function actualizarUsuario(raw: EdicionUsuarioInput): Promise<ResultadoEdicion> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede editar usuarios." };
  if (typeof raw !== "object" || raw === null || typeof raw.id !== "string" || !raw.id) {
    return { ok: false, error: "Datos inválidos." };
  }
  const nombre = typeof raw.nombre === "string" ? raw.nombre.trim().replace(/\s+/g, " ") : "";
  if (nombre.length < 2 || nombre.length > 100) {
    return { ok: false, error: "Escribe el nombre (entre 2 y 100 caracteres).", campo: "nombre" };
  }
  if (typeof raw.rol !== "string" || !(ROLES as readonly string[]).includes(raw.rol)) {
    return { ok: false, error: "Selecciona el rol.", campo: "rol" };
  }
  const rol = raw.rol;
  if (raw.id === admin.id && rol !== "ADMIN") {
    return { ok: false, error: "No puedes quitarte el rol de administrador a ti mismo.", campo: "rol" };
  }

  try {
    await db.$transaction(
      async (tx) => {
        const actual = await tx.usuario.findUniqueOrThrow({
          where: { id: raw.id, agenciaId: admin.agenciaId },
          select: { rol: true, activo: true, nombre: true, email: true },
        });
        if (actual.rol === "ADMIN" && rol !== "ADMIN" && actual.activo) {
          await verificarOtroAdmin(tx, admin.agenciaId, raw.id, "quitarle el rol de administrador");
        }
        await tx.usuario.update({ where: { id: raw.id, agenciaId: admin.agenciaId }, data: { nombre, rol } });
        const cambios = [
          actual.nombre !== nombre && `nombre «${actual.nombre}» → «${nombre}»`,
          actual.rol !== rol && `rol ${rolLabels[actual.rol]} → ${rolLabels[rol as RolUsuario]}`,
        ].filter(Boolean);
        if (cambios.length > 0) {
          await registrarBitacora(
            admin,
            { accion: "usuario.editar", entidad: "usuario", entidadId: raw.id, descripcion: `${actual.email}: ${cambios.join(", ")}` },
            tx
          );
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    return errorDeTransaccion(e, "actualizarUsuario");
  }
  revalidatePath("/sistema/usuarios");
  return { ok: true };
}

/** Duración del bloqueo en Supabase Auth para una cuenta desactivada (~100 años). */
const BLOQUEO_INDEFINIDO = "876000h";

/**
 * Desactiva (borrado suave) o reactiva una cuenta. Desactivada: el CRM rechaza su sesión de
 * inmediato y Supabase Auth la bloquea para que no pueda volver a iniciar sesión. Se conserva
 * el registro para el historial y para poder reactivarla.
 */
export async function cambiarEstadoUsuario(id: string, activo: boolean): Promise<ResultadoEdicion> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede desactivar usuarios." };
  if (typeof id !== "string" || !id || typeof activo !== "boolean") return { ok: false, error: "Datos inválidos." };
  if (!activo && id === admin.id) return { ok: false, error: "No puedes desactivar tu propia cuenta." };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Falta SUPABASE_SECRET_KEY en el servidor para bloquear o desbloquear cuentas." };
  }

  let email: string;
  try {
    email = await db.$transaction(
      async (tx) => {
        const actual = await tx.usuario.findUniqueOrThrow({
          where: { id, agenciaId: admin.agenciaId },
          select: { rol: true, email: true, activo: true, rolSistema: true },
        });
        if (!activo && actual.rol === "ADMIN") await verificarOtroAdmin(tx, admin.agenciaId, id, "desactivarlo");
        // Reactivar ocupa otro lugar del plan (la cuenta desactivada no cuenta).
        if (activo && !actual.activo && actual.rolSistema === "USER") {
          const falta = await faltaCupoUsuarios(tx, admin.agenciaId);
          if (falta) throw new LimitePlanError(falta);
        }
        await tx.usuario.update({
          where: { id, agenciaId: admin.agenciaId },
          data: { activo, desactivado_at: activo ? null : new Date() },
        });
        return actual.email;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    return errorDeTransaccion(e, "cambiarEstadoUsuario");
  }

  const { error } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: activo ? "none" : BLOQUEO_INDEFINIDO,
  });
  if (error) {
    // Sin el bloqueo en Supabase el estado quedaría a medias: se revierte el cambio.
    await db.usuario.update({
      where: { id, agenciaId: admin.agenciaId },
      data: { activo: !activo, desactivado_at: activo ? new Date() : null },
    });
    console.error("[cambiarEstadoUsuario] Supabase Auth:", error.code, error.message);
    return { ok: false, error: `No se pudo ${activo ? "desbloquear" : "bloquear"} la cuenta en Supabase Auth.` };
  }
  // Solo cuando el cambio quedó completo (base de datos y Supabase Auth).
  await registrarBitacora(admin, {
    accion: "usuario.estado",
    entidad: "usuario",
    entidadId: id,
    descripcion: `${activo ? "Reactivó" : "Desactivó"} a ${email}`,
  });

  revalidatePath("/sistema/usuarios");
  return { ok: true };
}

export type ResultadoReasignacion = { ok: true; polizas: number; clientes: number; tareas: number } | { ok: false; error: string };

/**
 * ADMIN: pasa la cartera de una cuenta a otra (o la deja sin asignar con `aId` vacío): sus
 * pólizas, sus clientes y sus tareas pendientes. Útil cuando alguien deja la agencia o cambia de
 * rol. Las pólizas y los clientes solo los lleva un Administrador o un Ejecutivo comercial; si
 * solo hay tareas, las recibe cualquier cuenta activa.
 */
export async function reasignarCartera(deId: string, aId: string): Promise<ResultadoReasignacion> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede reasignar cartera." };
  if (typeof deId !== "string" || !deId || typeof aId !== "string" || deId === aId) {
    return { ok: false, error: "Datos inválidos." };
  }
  const [de, a, conCartera] = await Promise.all([
    db.usuario.findFirst({ where: { id: deId, agenciaId: admin.agenciaId }, select: { id: true, nombre: true } }),
    aId
      ? db.usuario.findFirst({
          where: { id: aId, agenciaId: admin.agenciaId, activo: true, rolSistema: "USER" },
          select: { id: true, nombre: true, rol: true },
        })
      : Promise.resolve(null),
    db.poliza
      .count({ where: { agenciaId: admin.agenciaId, ejecutivoId: deId } })
      .then(async (n) => n > 0 || (await db.cliente.count({ where: { agenciaId: admin.agenciaId, ejecutivoId: deId } })) > 0),
  ]);
  if (!de) return { ok: false, error: "La cuenta ya no existe; recarga la página." };
  if (aId && !a) return { ok: false, error: "La cuenta que recibe la cartera ya no está activa." };
  if (a && conCartera && !ROLES_CARTERA.includes(a.rol)) {
    return {
      ok: false,
      error: `${a.nombre} es ${rolLabels[a.rol]}: las pólizas y los clientes solo los recibe un Administrador o un Ejecutivo comercial.`,
    };
  }
  const destino = a?.id ?? null;

  const resultado = await db.$transaction(async (tx) => {
    const polizas = await tx.poliza.updateMany({ where: { agenciaId: admin.agenciaId, ejecutivoId: de.id }, data: { ejecutivoId: destino } });
    const clientes = await tx.cliente.updateMany({ where: { agenciaId: admin.agenciaId, ejecutivoId: de.id }, data: { ejecutivoId: destino } });
    // Tareas pendientes: su parte pasa a quien recibe (si ya era encargado de esa tarea, solo se
    // quita la suya); sin destino, deja de ser encargado. Si los que quedan ya terminaron, la
    // tarea queda hecha.
    const partes = await tx.tareaResponsable.findMany({
      where: {
        agenciaId: admin.agenciaId,
        usuarioId: de.id,
        completadaAt: null,
        tarea: { eliminadaAt: null, completadaAt: null },
      },
      select: { tareaId: true },
    });
    const ids = partes.map((p) => p.tareaId);
    const yaEncargado = new Set(
      destino && ids.length
        ? (await tx.tareaResponsable.findMany({ where: { usuarioId: destino, tareaId: { in: ids } }, select: { tareaId: true } })).map(
            (p) => p.tareaId
          )
        : []
    );
    for (const tareaId of ids) {
      const clave = { tareaId_usuarioId: { tareaId, usuarioId: de.id } };
      if (destino && !yaEncargado.has(tareaId)) {
        await tx.tareaResponsable.update({ where: clave, data: { usuarioId: destino } });
        continue;
      }
      await tx.tareaResponsable.delete({ where: clave });
      const restantes = await tx.tareaResponsable.findMany({ where: { tareaId }, select: { completadaAt: true } });
      if (restantes.length > 0 && restantes.every((r) => r.completadaAt !== null)) {
        await tx.tarea.update({ where: { id: tareaId }, data: { completadaAt: new Date(), completadaPorEmail: admin.email } });
      }
    }
    const tareas = { count: ids.length };
    await registrarBitacora(
      admin,
      {
        accion: "cartera.reasignar",
        entidad: "usuario",
        entidadId: de.id,
        descripcion:
          `Reasignó la cartera de ${de.nombre} a ${a?.nombre ?? "nadie (sin asignar)"}: ` +
          `${polizas.count} pólizas, ${clientes.count} clientes y ${tareas.count} tareas pendientes`,
      },
      tx
    );
    return { polizas: polizas.count, clientes: clientes.count, tareas: tareas.count };
  });
  revalidatePath("/sistema/usuarios");
  revalidatePath("/", "layout");
  return { ok: true, ...resultado };
}
