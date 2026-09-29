"use server";

import { revalidatePath } from "next/cache";

import { CLAIM_AGENCIA } from "@/lib/agencias/constantes";
import { getAdmin } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_PASSWORD, MIN_PASSWORD, ROLES, type RolUsuario } from "@/lib/usuarios/reglas";

export type NuevoUsuarioInput = { nombre: string; email: string; password: string; rol: RolUsuario };

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

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    // Lo da de alta un administrador: no hace falta confirmar el correo para entrar.
    email_confirm: true,
    user_metadata: { nombre },
    // La cuenta nueva pertenece a la agencia del administrador que la crea.
    app_metadata: { [CLAIM_AGENCIA]: admin.agenciaId },
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
    await db.$transaction(async (tx) => {
      await tx.usuario.create({ data: { id: data.user.id, agenciaId: admin.agenciaId, nombre, email, rol } });
      await registrarBitacora(
        admin,
        { accion: "usuario.crear", entidad: "usuario", entidadId: data.user.id, descripcion: `Creó a ${nombre} (${email}) como ${rol}` },
        tx
      );
    });
  } catch (e) {
    // Sin perfil la cuenta quedaría huérfana: se deshace para poder reintentar.
    await supabase.auth.admin.deleteUser(data.user.id);
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
  if (e instanceof ReglaUsuarioError) return { ok: false, error: e.message };
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
          actual.rol !== rol && `rol ${actual.rol} → ${rol}`,
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
          select: { rol: true, email: true },
        });
        if (!activo && actual.rol === "ADMIN") await verificarOtroAdmin(tx, admin.agenciaId, id, "desactivarlo");
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
