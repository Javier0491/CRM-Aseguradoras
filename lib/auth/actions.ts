"use server";

import { redirect } from "next/navigation";

import { sincronizarAgenciaEnAuth } from "@/lib/agencias/sesion";
import { db } from "@/lib/db";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

/** Solo permite redirecciones internas para evitar open redirects (`//evil.com`, `https://…`). */
function destinoSeguro(next: FormDataEntryValue | null) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}

export async function iniciarSesion(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña.", email };
  }
  if (!getSupabaseConfig()) {
    return { error: "La autenticación no está configurada en el servidor.", email };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensaje genérico: no revela si el correo existe.
    return { error: "Correo o contraseña incorrectos.", email };
  }

  // La agencia del usuario va en el JWT (app_metadata.agencia_id) para filtrar por agencia y
  // aplicar RLS. Si hubo que escribirla, se refresca la sesión para que el token ya la traiga.
  const perfil = await db.usuario.findUnique({ where: { id: data.user.id }, select: { agenciaId: true } });
  if (perfil && (await sincronizarAgenciaEnAuth(data.user, perfil.agenciaId))) {
    await supabase.auth.refreshSession();
  }

  redirect(destinoSeguro(formData.get("next")));
}

export async function cerrarSesion() {
  if (getSupabaseConfig()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
