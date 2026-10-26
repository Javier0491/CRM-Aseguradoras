import { NextResponse, type NextRequest } from "next/server";

import { formaPagoLabel, ramoLabel } from "@/components/polizas/poliza-ui";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import { getPorRenovarReporte } from "@/lib/renovaciones/queries";
import { COLUMNAS_EMBUDO } from "@/lib/renovaciones/reglas";

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /renovaciones/reporte-por-renovar — Excel de las pólizas por renovar que ve la sesión: las del
 * tablero sin renovación capturada ni perdidas, con su vigencia, prima, etapa y días para vencer.
 * Respeta el filtro de ejecutivo de la pantalla (?ejecutivo=…).
 */
export async function GET(request: NextRequest) {
  const user = await getUsuarioCrm();
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  const polizas = await getPorRenovarReporte({ ejecutivo: request.nextUrl.searchParams.get("ejecutivo") || undefined });
  const hoy = hoyISO();

  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(
    polizas.map((p) => ({
      Cliente: p.cliente.nombre,
      RFC: p.cliente.rfc,
      Teléfono: p.cliente.telefono,
      Correo: p.cliente.email,
      Aseguradora: p.aseguradora.nombre,
      Ramo: ramoLabel[p.ramo],
      "Número de póliza": p.numeroImpreso,
      "Póliza vigor": p.polizaVigor ?? "",
      "Inicio de vigencia": fechaIso(p.vigencia_inicio),
      "Fin de vigencia": fechaIso(p.vigencia_fin),
      // Negativo: ya venció y aún se puede renovar.
      "Días para vencer": p.dias,
      "Prima total": Number(p.prima_total),
      "Prima neta": p.prima_neta === null ? "" : Number(p.prima_neta),
      "Forma de pago": formaPagoLabel[p.forma_pago],
      Etapa: COLUMNAS_EMBUDO.find((c) => c.clave === p.columna)?.titulo ?? "",
      Nota: p.renovacionNota ?? "",
      "Actividades pendientes": p.tareas.map((t) => t.titulo).join(", "),
      Ejecutivo: p.ejecutivo?.nombre ?? "",
    }))
  );
  hoja["!cols"] = [32, 15, 14, 28, 16, 16, 20, 18, 12, 12, 10, 14, 14, 14, 12, 30, 30, 24].map((wch) => ({ wch }));
  // Primas como moneda (L, M).
  for (let fila = 2; fila <= polizas.length + 1; fila++) {
    for (const col of ["L", "M"]) if (hoja[`${col}${fila}`]) hoja[`${col}${fila}`].z = '"$"#,##0.00';
  }
  XLSX.utils.book_append_sheet(libro, hoja, "Por renovar");

  const archivo: Buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="polizas-por-renovar-${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
