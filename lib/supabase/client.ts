import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "@/lib/supabase/config";

/** Cliente de Supabase para Client Components; usa la sesión de las cookies del navegador. */
export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en el entorno."
    );
  }
  return createBrowserClient(config.url, config.key);
}
