import { NextResponse, type NextRequest } from "next/server";

import { estadoVigencia, ramoLabel, vigenciaEstilo } from "@/components/polizas/poliza-ui";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import type { Ramo } from "@/lib/generated/prisma/client";
import { DIAS_POR_VENCER, esEstatusPolizas, esFiltroContacto, getPolizasExportacion } from "@/lib/polizas/queries";

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
const esRamo = (v: unknown): v is Ramo => typeof v === "string" && v in ramoLabel;

/**
 * GET /polizas/reporte-sin-contacto — Excel de los clientes sin teléfono o correo (uno por renglón, con sus
 * pólizas), para completarlos. Respeta los filtros del listado (?q=…&ramo=…&ejecutivo=…&estatus=…&aseguradora=…); sin
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
  // Un renglón por cliente: el contacto vive en su expediente, así que se captura una vez y vale para
  // todas sus pólizas.
  const porCliente = new Map<string, typeof polizas>();
  for (const p of polizas) {
    const lista = porCliente.get(p.cliente.id);
    if (lista) lista.push(p);
    else porCliente.set(p.cliente.id, [p]);
  }
  const clientes = [...porCliente.values()].sort((a, b) =>
    a[0].cliente.nombre.localeCompare(b[0].cliente.nombre, "es")
  );
  const hoy = hoyISO();
  const unicos = (valores: string[]) => [...new Set(valores.filter(Boolean))].join(", ");

  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(
    clientes.map((lista) => {
      const { cliente } = lista[0];
      // Primero las que siguen en vigor, de la que vence antes a la que vence después.
      lista.sort(
        (a, b) =>
          Number(a.canceladaAt != null) - Number(b.canceladaAt != null) ||
          a.vigencia_fin.getTime() - b.vigencia_fin.getTime()
      );
      return {
        Contratante: cliente.nombre,
        RFC: cliente.rfc,
        Falta: !cliente.telefono && !cliente.email ? "Teléfono y correo" : !cliente.telefono ? "Teléfono" : "Correo",
        Teléfono: cliente.telefono,
        Correo: cliente.email,
        Pólizas: lista.length,
        "Números de póliza": unicos(lista.map((p) => p.numeroImpreso)),
        Aseguradoras: unicos(lista.map((p) => p.aseguradora.nombre)),
        Ramos: unicos(lista.map((p) => ramoLabel[p.ramo])),
        Estatus: unicos(
          lista.map((p) => vigenciaEstilo[estadoVigencia(p.vigencia_fin, hoy, DIAS_POR_VENCER, p.canceladaAt)].label)
        ),
        "Próximo vencimiento": fechaIso(lista[0].vigencia_fin),
        Ejecutivos: unicos(lista.map((p) => p.ejecutivo?.nombre ?? "")),
      };
    })
  );
  hoja["!cols"] = [32, 15, 18, 14, 28, 9, 32, 24, 20, 18, 14, 24].map((wch) => ({ wch }));
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
