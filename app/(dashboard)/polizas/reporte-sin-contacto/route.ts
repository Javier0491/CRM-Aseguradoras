import { NextResponse, type NextRequest } from "next/server";

import { estadoVigencia, ramoLabel, vigenciaEstilo } from "@/components/polizas/poliza-ui";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import type { Ramo } from "@/lib/generated/prisma/client";
import { DIAS_POR_VENCER, esEstatusPolizas, esFiltroContacto, getPolizasExportacion } from "@/lib/polizas/queries";

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
const esRamo = (v: unknown): v is Ramo => typeof v === "string" && v in ramoLabel;

/**
 * GET /polizas/reporte-sin-contacto — Excel de las pólizas cuyo cliente no tiene teléfono o correo, para
 * completarlos. Respeta los filtros del listado (?q=…&ramo=…&ejecutivo=…&estatus=…&aseguradora=…); sin
 * ?contacto=telefono|correo|ambos, incluye a todas las que les falta alguno de los dos.
 */
export async function GET(request: NextRequest) {
  const user = await getUsuarioCrm();
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const ramo = params.get("ramo");
  const estatus = params.get("estatus");
  const contacto = params.get("contacto");
  const polizas = await getPolizasExportacion({
    q: params.get("q") ?? "",
    ramo: esRamo(ramo) ? ramo : undefined,
    faltaContacto: esFiltroContacto(contacto) ? contacto : "falta",
    ejecutivo: params.get("ejecutivo") || undefined,
    estatus: esEstatusPolizas(estatus) ? estatus : undefined,
    aseguradora: params.get("aseguradora") || undefined,
  });
  // Por cliente, para completar de una vez los datos de quien tiene varias pólizas.
  polizas.sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre, "es"));
  const hoy = hoyISO();

  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(
    polizas.map((p) => ({
      Contratante: p.cliente.nombre,
      RFC: p.cliente.rfc,
      Falta:
        !p.cliente.telefono && !p.cliente.email ? "Teléfono y correo" : !p.cliente.telefono ? "Teléfono" : "Correo",
      Teléfono: p.cliente.telefono,
      Correo: p.cliente.email,
      "Número de póliza": p.numeroImpreso,
      "Póliza vigor": p.polizaVigor ?? "",
      Aseguradora: p.aseguradora.nombre,
      Ramo: ramoLabel[p.ramo],
      Estatus: vigenciaEstilo[estadoVigencia(p.vigencia_fin, hoy, DIAS_POR_VENCER, p.canceladaAt)].label,
      "Fecha de vencimiento": fechaIso(p.vigencia_fin),
      Ejecutivo: p.ejecutivo?.nombre ?? "",
    }))
  );
  hoja["!cols"] = [32, 15, 18, 14, 28, 18, 14, 16, 16, 12, 14, 24].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(libro, hoja, "Sin contacto");

  const archivo: Buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="polizas-sin-contacto-${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
