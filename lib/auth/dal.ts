import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { sincronizarAgenciaEnAuth } from "@/lib/agencias/sesion";
import { db } from "@/lib/db";
import type { Rol } from "@/lib/generated/prisma/client";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UsuarioSesion = {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Rol;
  /** Agencia (tenant) del usuario: todas sus consultas deben filtrarse por ella. */
  agenciaId: string;
};

/**
 * Usuario autenticado de la solicitud actual, verificado contra Supabase Auth, con su rol y
 * su agencia.
 * Memoizado por render para no repetir la consulta.
 */
export const getCurrentUser = cache(async (): Promise<UsuarioSesion | null> => {
  // La sesión es por solicitud: nunca debe resolverse durante el prerender del build.
  await connection();
  if (!getSupabaseConfig()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const perfil = await db.usuario.findUnique({
    where: { id: data.user.id },
    select: { nombre: true, rol: true, activo: true, agenciaId: true },
  });
  // Sin perfil no hay agencia (y por lo tanto ningún dato que pueda ver); desactivada: su token
  // puede seguir vigente un rato, pero ya no es una sesión válida.
  if (!perfil || !perfil.activo) return null;
  // La agencia vive en `usuarios` (fuente de verdad). Se mantiene también en el claim del JWT
  // para RLS (solo escribe si no coincide); el token nuevo llega en el siguiente refresh.
  await sincronizarAgenciaEnAuth(data.user, perfil.agenciaId);
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    nombre: perfil.nombre,
    rol: perfil.rol,
    agenciaId: perfil.agenciaId,
  };
});

export const esAdmin = (user: UsuarioSesion | null) => user?.rol === "ADMIN";

/** Exige sesión; si no existe redirige a /login. */
export async function requireUser(): Promise<UsuarioSesion> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige rol ADMIN para páginas de comisiones, conciliación, configuración y usuarios.
 * Sin sesión redirige a /login; un ejecutivo vuelve al dashboard.
 */
export async function requireAdmin(): Promise<UsuarioSesion> {
  const user = await requireUser();
  if (!esAdmin(user)) redirect("/");
  return user;
}

/**
 * Agencia del usuario de la sesión, para las funciones de consulta que no reciben el usuario.
 * Sin sesión redirige a /login (en páginas); en Route Handlers verifica la sesión antes.
 */
export async function getAgenciaId(): Promise<string> {
  return (await requireUser()).agenciaId;
}

/** Para Server Actions y Route Handlers: el admin de la sesión, o null. */
export async function getAdmin(): Promise<UsuarioSesion | null> {
  const user = await getCurrentUser();
  return esAdmin(user) ? user : null;
}
