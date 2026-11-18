import { NextResponse } from "next/server";

import { getAlmacen } from "@/lib/archivos/almacen";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { nombrePdfCotizacion, type DatosCotizacionAuto, type ResultadoCotizacion } from "@/lib/cotizador/reglas";
import { db } from "@/lib/db";

/**
 * GET /cotizador/{id}/pdf — descarga el PDF oficial de la aseguradora de una cotización. Redirige a
 * una URL firmada de corta vigencia. Quien solo ve su cartera solo descarga las que pidió.
 */
export async function GET(_req: Request, ctx: RouteContext<"/cotizador/[id]/pdf">) {
  const user = await getUsuarioCrm();
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const noExiste = NextResponse.json({ ok: false, error: "Esta cotización no tiene PDF." }, { status: 404 });
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return noExiste;

  const s = await db.solicitudCotizacion.findFirst({
    where: { id, agenciaId: user.agenciaId, ...(user.soloSuCartera ? { creadoPorId: user.id } : {}) },
    select: { aseguradora: true, datos: true, resultado: true, pdfClave: true },
  });
  if (!s?.pdfClave) return noExiste;

  const datos = s.datos as DatosCotizacionAuto | null;
  const resultado = s.resultado as ResultadoCotizacion | null;
  const nombre = nombrePdfCotizacion(s.aseguradora, resultado?.numeroCotizacion, datos?.vehiculo);

  let url: string;
  try {
    url = await getAlmacen().urlDescarga(s.pdfClave, { descargarComo: nombre });
  } catch (e) {
    console.error("[cotizador/pdf] no se pudo firmar la URL", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "No se pudo generar el enlace." }, { status: 502 });
  }
  const respuesta = NextResponse.redirect(url);
  respuesta.headers.set("Cache-Control", "private, max-age=45");
  return respuesta;
}
