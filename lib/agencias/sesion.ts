import "server-only";

import type { User } from "@supabase/supabase-js";

import { CLAIM_AGENCIA } from "@/lib/agencias/constantes";
import type { RolSistema } from "@/lib/generated/prisma/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Campos del perfil que definen la agencia de la sesión. */
export const SELECT_AGENCIA_SESION = { agenciaId: true, rolSistema: true, agenciaActivaId: true } as const;

/**
 * Agencia que opera la sesión: la propia, salvo un SUPERADMIN que entró a otra. Un
 * agenciaActivaId de alguien que ya no es SUPERADMIN se ignora.
 */
export function agenciaEfectiva(perfil: { agenciaId: string; rolSistema: RolSistema; agenciaActivaId: string | null }) {
  return perfil.rolSistema === "SUPERADMIN" && perfil.agenciaActivaId ? perfil.agenciaActivaId : perfil.agenciaId;
}

/**
 * Guarda la agencia del usuario en `app_metadata` de Supabase Auth, que viaja en el JWT de la
 * sesión (`auth.jwt() -> 'app_metadata' ->> 'agencia_id'`) y servirá para las políticas RLS.
 * `app_metadata` solo lo puede cambiar la secret key: el usuario no puede cambiarse de agencia.
 * No hace nada si ya coincide. Devuelve true si lo actualizó.
 */
export async function sincronizarAgenciaEnAuth(user: Pick<User, "id" | "app_metadata">, agenciaId: string) {
  if (user.app_metadata?.[CLAIM_AGENCIA] === agenciaId) return false;
  return escribirAgenciaEnAuth(user.id, agenciaId);
}

/** Escribe el claim sin comparar (cambio de agencia del SUPERADMIN). Devuelve true si lo escribió. */
export async function escribirAgenciaEnAuth(userId: string, agenciaId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { [CLAIM_AGENCIA]: agenciaId },
  });
  if (error) {
    console.error("[escribirAgenciaEnAuth]", error.code, error.message);
    return false;
  }
  return true;
}
