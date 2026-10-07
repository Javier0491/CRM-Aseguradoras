import { NextResponse, type NextRequest } from "next/server";

import { formaPagoLabel, ramoLabel } from "@/components/polizas/poliza-ui";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import { getRenovadasReporte } from "@/lib/renovaciones/queries";

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /renovaciones/reporte — Excel de las pólizas renovadas que ve la sesión: un renglón por
 * renovación con la vigencia anterior y la nueva (póliza vigor, fechas y primas) y la variación de
 * la prima. Respeta el filtro de ejecutivo de la pantalla (?ejecutivo=…).
 */
export async function GET(request: NextRequest) {
  const user = await getUsuarioCrm();
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  const renovadas = await getRenovadasReporte({ ejecutivo: request.nextUrl.searchParams.get("ejecutivo") || undefined });
  const hoy = hoyISO();

  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(
    renovadas.map(({ anterior: a, nueva: n }) => {
      const primaAnterior = Number(a.prima_total);
      const primaNueva = Number(n.prima_total);
      return {
        Cliente: n.cliente.nombre,
        RFC: n.cliente.rfc,
        Teléfono: n.cliente.telefono,
        Correo: n.cliente.email,
        Aseguradora: n.aseguradora.nombre,
        Ramo: ramoLabel[n.ramo],
        "Número de póliza": n.numeroImpreso,
        "Póliza vigor anterior": a.polizaVigor ?? "",
        "Inicio vigencia anterior": fechaIso(a.vigencia_inicio),
        "Fin vigencia anterior": fechaIso(a.vigencia_fin),
        "Prima total anterior": primaAnterior,
        "Póliza vigor nueva": n.polizaVigor ?? "",
        "Inicio vigencia nueva": fechaIso(n.vigencia_inicio),
        "Fin vigencia nueva": fechaIso(n.vigencia_fin),
        "Prima total nueva": primaNueva,
        "Prima neta nueva": n.prima_neta === null ? "" : Number(n.prima_neta),
        "Variación de prima": primaAnterior > 0 ? primaNueva / primaAnterior - 1 : "",
        "Forma de pago": formaPagoLabel[n.forma_pago],
        Ejecutivo: n.ejecutivo?.nombre ?? a.ejecutivo?.nombre ?? "",
      };
    })
  );
  hoja["!cols"] = [32, 15, 14, 28, 16, 16, 20, 18, 12, 12, 14, 18, 12, 12, 14, 14, 10, 14, 24].map((wch) => ({ wch }));
  // Primas como moneda (K, O, P) y la variación como porcentaje (Q).
  for (let fila = 2; fila <= renovadas.length + 1; fila++) {
    for (const col of ["K", "O", "P"]) if (hoja[`${col}${fila}`]) hoja[`${col}${fila}`].z = '"$"#,##0.00';
    if (hoja[`Q${fila}`]) hoja[`Q${fila}`].z = "0.0%";
  }
  XLSX.utils.book_append_sheet(libro, hoja, "Renovadas");

  const archivo: Buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="polizas-renovadas-${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
