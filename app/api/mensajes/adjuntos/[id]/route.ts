import { NextResponse, type NextRequest } from "next/server";

import { getAlmacen } from "@/lib/archivos/almacen";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { TIPOS_ADJUNTO } from "@/lib/mensajes/adjuntos";
import { agenciaDelChat, conversacionDe } from "@/lib/mensajes/queries";

/**
 * GET /api/mensajes/adjuntos/{id} — el archivo de un mensaje del chat, solo para quien participa
 * en su conversación: redirige a una URL firmada de corta vigencia. Las imágenes y los PDF se
 * abren en el navegador (salvo `?descargar=1`); lo demás siempre se descarga con su nombre.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/mensajes/adjuntos/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const noExiste = NextResponse.json({ ok: false, error: "El archivo ya no existe." }, { status: 404 });
  if (!/^[\w-]{1,64}$/.test(id)) return noExiste;
  const m = await db.mensaje.findFirst({
    where: { id, agenciaId: agenciaDelChat(user), eliminadoAt: null, adjuntoClave: { not: null } },
    select: { conversacionId: true, adjuntoClave: true, adjuntoNombre: true, adjuntoTipo: true },
  });
  if (!m?.adjuntoClave || !m.adjuntoTipo || !(await conversacionDe(user, m.conversacionId))) return noExiste;

  const enLinea = TIPOS_ADJUNTO[m.adjuntoTipo]?.enLinea === true;
  const descargar = !enLinea || req.nextUrl.searchParams.get("descargar") === "1";
  let url: string;
  try {
    url = await getAlmacen().urlDescarga(m.adjuntoClave, descargar ? { descargarComo: m.adjuntoNombre ?? "archivo" } : undefined);
  } catch (e) {
    console.error("[chat] no se pudo firmar el adjunto", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "No se pudo generar el enlace." }, { status: 502 });
  }
  const respuesta = NextResponse.redirect(url);
  // La URL firmada dura un minuto: el navegador puede reusar la redirección un poco menos.
  respuesta.headers.set("Cache-Control", "private, max-age=45");
  return respuesta;
}
