import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase/config";

let cliente: SupabaseClient | undefined;

/**
 * Cliente con privilegios de administrador (crear cuentas de Supabase Auth).
 * Usa la secret key (`sb_secret_…`), que salta RLS: nunca debe llegar al navegador.
 * null si falta SUPABASE_SECRET_KEY.
 */
export function getSupabaseAdmin() {
  const config = getSupabaseConfig();
  const secreta = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secreta) return null;
  cliente ??= createClient(config.url, secreta, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cliente;
}
