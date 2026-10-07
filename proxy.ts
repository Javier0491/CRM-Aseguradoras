import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Rutas accesibles sin sesión. /api/cron no usa sesión: cada ruta exige CRON_SECRET. /dev es la
// galería de datos de prueba: solo en desarrollo (en producción responde 404) y no lee la base.
// /sw.js y el manifiesto los pide el navegador por su cuenta (notificaciones e instalación).
const RUTAS_PUBLICAS = ["/login", "/api/cron", "/sw.js", "/manifest.webmanifest", ...(process.env.NODE_ENV === "development" ? ["/dev"] : [])];

function esPublica(pathname: string) {
  return RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));
}

/**
 * Bloqueo de acceso: todo el CRM requiere sesión.
 * Es una verificación optimista; la sesión se valida de nuevo junto a los
 * datos (lib/auth/dal.ts) en layouts, Server Actions y Route Handlers.
 */
export async function proxy(request: NextRequest) {
  const { response, autenticado } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!autenticado && !esPublica(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Quien ya tiene sesión y abre /login lo decide la propia página con getUser(). Aquí no:
  // getClaims() solo valida la firma del token, que sigue siendo válido un rato después de
  // que la sesión se revoca en Supabase; redirigir desde aquí provocaba un ciclo
  // /login → / → /login cuando el layout (getUser) ya no reconocía la sesión.

  return response;
}

export const config = {
  // Todo excepto assets estáticos e imágenes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
