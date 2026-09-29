import "server-only";

import type { User } from "@supabase/supabase-js";

import { CLAIM_AGENCIA } from "@/lib/agencias/constantes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Guarda la agencia del usuario en `app_metadata` de Supabase Auth, que viaja en el JWT de la
 * sesión (`auth.jwt() -> 'app_metadata' ->> 'agencia_id'`) y servirá para las políticas RLS.
 * `app_metadata` solo lo puede cambiar la secret key: el usuario no puede cambiarse de agencia.
 * No hace nada si ya coincide. Devuelve true si lo actualizó.
 */
export async function sincronizarAgenciaEnAuth(user: Pick<User, "id" | "app_metadata">, agenciaId: string) {
  if (user.app_metadata?.[CLAIM_AGENCIA] === agenciaId) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { [CLAIM_AGENCIA]: agenciaId },
  });
  if (error) {
    console.error("[sincronizarAgenciaEnAuth]", error.code, error.message);
    return false;
  }
  return true;
}
