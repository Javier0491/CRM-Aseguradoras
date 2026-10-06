import { NextResponse, type NextRequest } from "next/server";

import { getAlmacen } from "@/lib/archivos/almacen";
import { ARCHIVOS, COLUMNAS_ARCHIVO, esTipoArchivo } from "@/lib/archivos/config";
import { alcanceDe, polizasDe } from "@/lib/auth/alcance";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/**
 * Redirige a una URL firmada de corta vigencia (Supabase o R2) para un archivo de la póliza.
 * Los PDF (carátula, negociación) se abren en el navegador salvo que se pida
 * `?descargar=1`; el expediente ZIP siempre se descarga.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/polizas/[id]/archivos/[tipo]">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }

  const { id, tipo } = await ctx.params;
  if (!esTipoArchivo(tipo)) {
    return NextResponse.json({ ok: false, error: "Tipo de archivo inválido." }, { status: 404 });
  }

  if (!/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "La póliza no existe." }, { status: 404 });
  }
  const poliza = await db.poliza.findFirst({
    where: { id, ...polizasDe(alcanceDe(user)) },
    select: {
      caratula_path: true,
      caratula_nombre: true,
      negociacion_path: true,
      negociacion_nombre: true,
      expediente_path: true,
      expediente_nombre: true,
    },
  });
  const columnas = COLUMNAS_ARCHIVO[tipo];
  const path = poliza?.[columnas.path];
  const nombre = poliza?.[columnas.nombre];
  if (!path) {
    return NextResponse.json({ ok: false, error: "La póliza no tiene este archivo." }, { status: 404 });
  }

  const descargar = !ARCHIVOS[tipo].verEnLinea || req.nextUrl.searchParams.get("descargar") === "1";
  let url: string;
  try {
    url = await getAlmacen().urlDescarga(
      path,
      descargar ? { descargarComo: nombre ?? `${tipo}.${ARCHIVOS[tipo].extension}` } : undefined
    );
  } catch (e) {
    console.error("[archivos] no se pudo firmar la URL", e);
    return NextResponse.json({ ok: false, error: "No se pudo generar el enlace." }, { status: 502 });
  }

  return NextResponse.redirect(url);
}
