import { NextResponse, type NextRequest } from "next/server";

import { formaPagoLabel, ramoLabel } from "@/components/polizas/poliza-ui";
import { alcanceDe } from "@/lib/auth/alcance";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import { esPeriodoReporte, PERIODO_REPORTE_PREDETERMINADO } from "@/lib/reportes/periodos";
import { getPolizasReporte } from "@/lib/reportes/queries";

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
const importe = (n: number | null) => (n === null ? "" : n.toFixed(2));

/** Entrecomilla solo lo necesario (RFC 4180). */
function celda(valor: string) {
  return /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** GET /reportes/exportar?periodo=… — CSV con las pólizas emitidas en el periodo del reporte. */
export async function GET(req: NextRequest) {
  const user = await getUsuarioCrm();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }

  const param = req.nextUrl.searchParams.get("periodo");
  const periodo = esPeriodoReporte(param) ? param : PERIODO_REPORTE_PREDETERMINADO;
  const polizas = await getPolizasReporte(alcanceDe(user), periodo);

  const filas = [
    [
      "Póliza",
      "Póliza vigor",
      "Ramo",
      "Cliente",
      "Aseguradora",
      "Forma de pago",
      "Inicio de vigencia",
      "Fin de vigencia",
      "Prima neta",
      "Prima total",
      "Ejecutivo",
      "Cancelada el",
    ],
    ...polizas.map((p) => [
      p.numeroImpreso,
      p.polizaVigor ?? "",
      ramoLabel[p.ramo],
      p.cliente.nombre,
      p.aseguradora.nombre,
      formaPagoLabel[p.forma_pago],
      fechaIso(p.vigencia_inicio),
      fechaIso(p.vigencia_fin),
      importe(p.prima_neta),
      importe(p.prima_total),
      p.ejecutivo?.nombre ?? "",
      p.canceladaAt ? fechaIso(p.canceladaAt) : "",
    ]),
  ];
  // BOM para que Excel abra los acentos en UTF-8.
  const csv = "\uFEFF" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-polizas-${periodo}-${hoyISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
