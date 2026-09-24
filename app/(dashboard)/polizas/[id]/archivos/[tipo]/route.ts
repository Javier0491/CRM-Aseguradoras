import { NextResponse, type NextRequest } from "next/server";

import { ARCHIVOS, ARCHIVOS_BUCKET, COLUMNAS_ARCHIVO, esTipoArchivo } from "@/lib/archivos/config";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Vigencia corta: el enlace solo debe servir para la consulta que se inicia ahora.
const VIGENCIA_ENLACE_S = 60;

/**
 * Redirige a una URL firmada de Storage para un archivo de la póliza.
 * Los PDF (carátula, negociación) se abren en el navegador salvo que se pida
 * `?descargar=1`; el expediente ZIP siempre se descarga.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/polizas/[id]/archivos/[tipo]">) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }

  const { id, tipo } = await ctx.params;
  if (!esTipoArchivo(tipo)) {
    return NextResponse.json({ ok: false, error: "Tipo de archivo inválido." }, { status: 404 });
  }

  const poliza = await db.poliza.findUnique({
    where: { id },
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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(ARCHIVOS_BUCKET)
    .createSignedUrl(
      path,
      VIGENCIA_ENLACE_S,
      descargar ? { download: nombre ?? `${tipo}.${path.split(".").pop()}` } : undefined
    );
  if (error || !data) {
    console.error("[archivos] no se pudo firmar la URL", error);
    return NextResponse.json({ ok: false, error: "No se pudo generar el enlace." }, { status: 502 });
  }

  return NextResponse.redirect(data.signedUrl);
}
