import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UsuarioSesion = { id: string; email: string | null };

/**
 * Usuario autenticado de la solicitud actual, verificado contra Supabase Auth.
 * Memoizado por render para no repetir la consulta.
 */
export const getCurrentUser = cache(async (): Promise<UsuarioSesion | null> => {
  // La sesión es por solicitud: nunca debe resolverse durante el prerender del build.
  await connection();
  if (!getSupabaseConfig()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

/** Exige sesión; si no existe redirige a /login. */
export async function requireUser(): Promise<UsuarioSesion> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
