import "server-only";

import { TEMA_PREDETERMINADO, esTema, type Tema } from "@/lib/agencias/marca";
import { getMarcaLogin } from "@/lib/agencias/marca-login";
import { getAgencia } from "@/lib/agencias/queries";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Tema de la agencia de la sesión, para la clase de <html> en el layout raíz. Sin sesión (login)
 * el de la última agencia que entró en este navegador, o el predeterminado. Comparte la
 * memoización por render con el layout del dashboard.
 */
export async function getTemaSesion(): Promise<Tema> {
  const user = await getCurrentUser();
  if (!user) return (await getMarcaLogin().catch(() => null))?.tema ?? TEMA_PREDETERMINADO;
  const { tema } = await getAgencia(user.agenciaId);
  return esTema(tema) ? tema : TEMA_PREDETERMINADO;
}
