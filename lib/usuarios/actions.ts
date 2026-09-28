"use server";

import { revalidatePath } from "next/cache";

import { getAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
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
  if (!(await getAdmin())) return { ok: false, error: "Solo un administrador puede crear usuarios." };
  const v = validar(raw);
  if (!v.ok) return v;
  const { nombre, email, password, rol } = v.datos;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Falta SUPABASE_SECRET_KEY en el servidor para poder crear cuentas." };
  }
  if (await db.usuario.findUnique({ where: { email }, select: { id: true } })) {
    return { ok: false, error: "Ya existe un usuario con ese correo.", campo: "email" };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    // Lo da de alta un administrador: no hace falta confirmar el correo para entrar.
    email_confirm: true,
    user_metadata: { nombre },
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
    await db.usuario.create({ data: { id: data.user.id, nombre, email, rol } });
  } catch (e) {
    // Sin perfil la cuenta quedaría huérfana: se deshace para poder reintentar.
    await supabase.auth.admin.deleteUser(data.user.id);
    console.error("[crearUsuario] Perfil:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo registrar el usuario. Intenta de nuevo." };
  }

  revalidatePath("/sistema/usuarios");
  return { ok: true };
}
