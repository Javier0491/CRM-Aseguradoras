import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { agenciaEfectiva, SELECT_AGENCIA_SESION, sincronizarAgenciaEnAuth } from "@/lib/agencias/sesion";
import { db } from "@/lib/db";
import type { Rol } from "@/lib/generated/prisma/client";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esRolSoloTareas } from "@/lib/usuarios/reglas";

export type UsuarioSesion = {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Rol;
  /**
   * Agencia (tenant) que opera la sesión: todas sus consultas deben filtrarse por ella. Es la
   * del usuario, o la que eligió un SUPERADMIN.
   */
  agenciaId: string;
  /** Agencia a la que pertenece la cuenta (distinta de agenciaId si un SUPERADMIN entró a otra). */
  agenciaPropiaId: string;
  /** Rol de plataforma SUPERADMIN: puede cambiar de agencia y actúa como ADMIN en cualquiera. */
  superadmin: boolean;
  /**
   * EJECUTIVO de una agencia con "cartera por ejecutivo": solo ve los clientes y pólizas que
   * tiene asignados (ver lib/auth/alcance.ts).
   */
  soloSuCartera: boolean;
  /**
   * Ejecutiva de operación, Líder de oficina o Auxiliar: solo usan Tareas. El resto del CRM se
   * les cierra en tres capas: páginas (requireUsuarioCrm), acciones y API (getUsuarioCrm) y
   * datos (alcanceDe no les deja ver pólizas, clientes ni recibos).
   */
  soloTareas: boolean;
  /** Coordina las tareas del equipo: ve todas, marca la parte de cualquiera y borra cualquiera. */
  coordinaTareas: boolean;
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
    select: {
      nombre: true,
      rol: true,
      activo: true,
      agencia: { select: { suspendida: true, carteraPorEjecutivo: true } },
      ...SELECT_AGENCIA_SESION,
    },
  });
  // Sin perfil no hay agencia (y por lo tanto ningún dato que pueda ver); desactivada: su token
  // puede seguir vigente un rato, pero ya no es una sesión válida.
  if (!perfil || !perfil.activo) return null;
  // Agencia suspendida por el SUPERADMIN: nadie de ella entra (el SUPERADMIN sí, a cualquiera).
  if (perfil.agencia.suspendida && perfil.rolSistema !== "SUPERADMIN") return null;
  // La agencia vive en `usuarios` (fuente de verdad). Se mantiene también en el claim del JWT
  // para RLS (solo escribe si no coincide); el token nuevo llega en el siguiente refresh.
  const agenciaId = agenciaEfectiva(perfil);
  await sincronizarAgenciaEnAuth(data.user, agenciaId);
  const superadmin = perfil.rolSistema === "SUPERADMIN";
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    nombre: perfil.nombre,
    rol: superadmin ? "ADMIN" : perfil.rol,
    agenciaId,
    agenciaPropiaId: perfil.agenciaId,
    superadmin,
    // La opción es de la agencia propia, que para quien no es SUPERADMIN es la que opera.
    soloSuCartera: !superadmin && perfil.rol === "EJECUTIVO" && perfil.agencia.carteraPorEjecutivo,
    soloTareas: !superadmin && esRolSoloTareas(perfil.rol),
    coordinaTareas: superadmin || perfil.rol === "ADMIN" || perfil.rol === "LIDER_OFICINA",
  };
});

export const esAdmin = (user: UsuarioSesion | null) => user?.rol === "ADMIN";

/** Conciliación de cobranza: Administrador y Ejecutivo comercial. */
export const puedeConciliar = (user: UsuarioSesion | null) =>
  Boolean(user && !user.soloTareas && (user.rol === "ADMIN" || user.rol === "EJECUTIVO"));

/**
 * Las comisiones (matriz, % por póliza, montos esperados y pagados) solo las ve y edita el
 * SUPERADMIN: varias aseguradoras las pagan fraccionadas y el cálculo no es confiable para la
 * agencia. Ni ADMIN ni EJECUTIVO las ven.
 */
export const veComisiones = (user: UsuarioSesion | null) => Boolean(user?.superadmin);

/** Exige sesión; si no existe redirige a /login. Úsala solo en Tareas: el resto del CRM usa requireUsuarioCrm. */
export async function requireUser(): Promise<UsuarioSesion> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige sesión con acceso al CRM (no solo a Tareas): quien solo usa Tareas va a /tareas. */
export async function requireUsuarioCrm(): Promise<UsuarioSesion> {
  const user = await requireUser();
  if (user.soloTareas) redirect("/tareas");
  return user;
}

/** Para Server Actions y Route Handlers del CRM: el usuario de la sesión, o null si no hay o si solo usa Tareas. */
export async function getUsuarioCrm(): Promise<UsuarioSesion | null> {
  const user = await getCurrentUser();
  return user && !user.soloTareas ? user : null;
}

/** Exige poder conciliar la cobranza (Administrador o Ejecutivo comercial); si no, al dashboard. */
export async function requireConciliador(): Promise<UsuarioSesion> {
  const user = await requireUsuarioCrm();
  if (!puedeConciliar(user)) redirect("/");
  return user;
}

/** Para Server Actions: quien puede conciliar, o null. */
export async function getConciliador(): Promise<UsuarioSesion | null> {
  const user = await getCurrentUser();
  return puedeConciliar(user) ? user : null;
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
 * Exige el rol de plataforma SUPERADMIN (panel de agencias). El rol viene de la base de datos
 * (getCurrentUser), nunca del token. Sin sesión redirige a /login; sin el rol, al dashboard.
 */
export async function requireSuperadmin(): Promise<UsuarioSesion> {
  const user = await requireUser();
  if (!user.superadmin) redirect("/");
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
