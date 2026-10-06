import { db } from "@/lib/db";
import { getEstadoMigraciones } from "@/lib/plataforma/migraciones";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/sistema/estado — estado de las migraciones, solo para SUPERADMIN. Lo consultan las
 * pantallas de error: si se desplegó código sin aplicar sus migraciones, la aplicación falla antes
 * de mostrar nada, así que esta ruta no usa getCurrentUser (que lee columnas nuevas): verifica la
 * sesión con Supabase y el rol con SQL directo sobre columnas que ya existían.
 */
export async function GET() {
  if (!getSupabaseConfig()) return Response.json({ ok: false }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ ok: false }, { status: 401 });
  try {
    const filas = await db.$queryRaw<{ rol: string }[]>`
      SELECT rol_sistema::text AS rol FROM usuarios WHERE id = ${data.user.id} AND activo`;
    if (filas[0]?.rol !== "SUPERADMIN") return Response.json({ ok: false }, { status: 403 });
    return Response.json({ ok: true, migraciones: await getEstadoMigraciones() });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
