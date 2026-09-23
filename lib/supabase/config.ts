/**
 * Credenciales públicas de Supabase (formato nuevo: publishable key `sb_publishable_…`),
 * o null si faltan en el entorno.
 */
export function getSupabaseConfig() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !key) return null;

  // El SDK necesita la URL base del proyecto: descarta rutas pegadas por error
  // (p. ej. `/rest/v1/`), que harían fallar las llamadas a `/auth/v1`.
  let url: string;
  try {
    url = new URL(rawUrl).origin;
  } catch {
    return null;
  }
  return { url, key };
}
