import { NextResponse } from "next/server";

import { ramoLabel } from "@/components/polizas/poliza-ui";
import { getCurrentUser, veComisiones } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import { getEstadoConciliacion } from "@/lib/polizas/conciliacion";
import { etiquetaMotivo, etiquetaNoEncontrada } from "@/lib/polizas/conciliacion-motivos";

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /polizas/reporte-conciliacion — Excel para revisar lo que no se concilió: una hoja con las
 * pólizas sin conciliar y su motivo, y otra con los renglones de los estados de cuenta cuya
 * póliza no se encontró. La comisión pagada solo la ve el rol ADMIN.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }
  const verComisiones = veComisiones(user);
  const { sinConciliar, noEncontradas } = await getEstadoConciliacion();

  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();

  const hojaPolizas = XLSX.utils.json_to_sheet(
    sinConciliar.map((p) => ({
      Póliza: p.numeroImpreso,
      "Póliza vigor": p.polizaVigor ?? "",
      "Número en el estado de cuenta": p.numeroEnArchivo ?? "",
      Aseguradora: p.aseguradora.nombre,
      Ramo: ramoLabel[p.ramo],
      Cliente: p.cliente,
      RFC: p.rfc,
      "Inicio de vigencia": fechaIso(p.vigenciaInicio),
      "Fin de vigencia": fechaIso(p.vigenciaFin),
      Recibos: p.recibos,
      Motivo: etiquetaMotivo[p.motivo.tipo],
      Detalle: p.motivo.texto,
    }))
  );
  hojaPolizas["!cols"] = [16, 14, 22, 16, 16, 32, 16, 12, 12, 8, 26, 90].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(libro, hojaPolizas, "Pólizas sin conciliar");

  const hojaRenglones = XLSX.utils.json_to_sheet(
    noEncontradas.map((r) => ({
      "Número en el estado de cuenta": r.polizaArchivo,
      Aseguradora: r.aseguradora.nombre,
      Archivo: r.archivo,
      Fila: r.fila,
      "Conciliado el": fechaIso(r.fecha),
      "Veces sin encontrarse": r.veces,
      ...(verComisiones && { "Comisión pagada": r.comisionPagada }),
      Situación: etiquetaNoEncontrada[r.estado.tipo],
      "Póliza en el CRM": r.poliza?.numeroImpreso ?? "",
      Detalle: r.estado.texto,
    }))
  );
  hojaRenglones["!cols"] = [22, 16, 30, 6, 12, 10, ...(verComisiones ? [14] : []), 28, 18, 90].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(libro, hojaRenglones, "No encontradas en el CRM");

  const archivo: Buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="polizas-sin-conciliar-${hoyISO()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
