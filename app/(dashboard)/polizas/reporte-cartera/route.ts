import { NextResponse, type NextRequest } from "next/server";

import { estadoVigencia, formaPagoLabel, ramoLabel, vigenciaEstilo } from "@/components/polizas/poliza-ui";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import type { Ramo } from "@/lib/generated/prisma/client";
import { DIAS_POR_VENCER, getPolizasExportacion } from "@/lib/polizas/queries";

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
const esRamo = (v: unknown): v is Ramo => typeof v === "string" && v in ramoLabel;

/**
 * GET /polizas/reporte-cartera — Excel con la cartera de pólizas que ve la sesión. Respeta los mismos
 * filtros del listado (?q=…&ramo=…&ejecutivo=…&estatus=…&contacto=falta), pero sin su límite de renglones.
 */
export async function GET(request: NextRequest) {
  const user = await getUsuarioCrm();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  const ramo = params.get("ramo");
  const estatus = params.get("estatus");
  const polizas = await getPolizasExportacion({
    q: params.get("q") ?? "",
    ramo: esRamo(ramo) ? ramo : undefined,
    faltaContacto: params.get("contacto") === "falta",
    ejecutivo: params.get("ejecutivo") || undefined,
    canceladas: estatus === "canceladas" ? true : estatus === "vigor" ? false : undefined,
  });
  const hoy = hoyISO();

  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(
    polizas.map((p) => ({
      "Número de póliza": p.numeroImpreso,
      "Póliza vigor": p.polizaVigor ?? "",
      // En GMM o Vida el asegurado titular puede no ser el contratante; sin titular, es el contratante.
      Asegurado: p.asegurados[0]?.nombre ?? p.cliente.nombre,
      Contratante: p.cliente.nombre,
      RFC: p.cliente.rfc,
      Aseguradora: p.aseguradora.nombre,
      Ramo: ramoLabel[p.ramo],
      "Prima total": Number(p.prima_total),
      "Forma de pago": formaPagoLabel[p.forma_pago],
      Estatus: vigenciaEstilo[estadoVigencia(p.vigencia_fin, hoy, DIAS_POR_VENCER, p.canceladaAt)].label,
      "Inicio de vigencia": fechaIso(p.vigencia_inicio),
      "Fecha de vencimiento": fechaIso(p.vigencia_fin),
      Ejecutivo: p.ejecutivo?.nombre ?? "",
      "Cancelada el": p.canceladaAt ? fechaIso(p.canceladaAt) : "",
    }))
  );
  hoja["!cols"] = [18, 14, 32, 32, 16, 16, 16, 14, 14, 12, 12, 14, 24, 12].map((wch) => ({ wch }));
  // Prima total como moneda (columna H).
  for (let fila = 2; fila <= polizas.length + 1; fila++) {
    const celda = hoja[`H${fila}`];
    if (celda) celda.z = '"$"#,##0.00';
  }
  XLSX.utils.book_append_sheet(libro, hoja, "Cartera");

  const archivo: Buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cartera-polizas-${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
