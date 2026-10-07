import type { Metadata } from "next";

import { esPestana, esRamo, VistaPolizas } from "@/components/polizas/vista-polizas";
import { requireUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import { getEstadoConciliacion } from "@/lib/polizas/conciliacion";
import { esFiltroRecibos, getPolizasListado, getRecibosListado } from "@/lib/polizas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Pólizas",
};

export default async function PolizasPage({ searchParams }: PageProps<"/polizas">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const ramo = esRamo(params.ramo) ? params.ramo : undefined;
  const soloFaltaContacto = params.contacto === "falta";
  const ejecutivo = typeof params.ejecutivo === "string" ? params.ejecutivo.slice(0, 64) : "";
  const estatus = params.estatus === "vigor" || params.estatus === "canceladas" ? params.estatus : "";
  const filtroRecibos = esFiltroRecibos(params.recibos) ? params.recibos : "todos";
  const pestana = esPestana(params.tab) ? params.tab : "polizas";

  const user = await requireUsuarioCrm();
  const [listado, listadoRecibos, conciliacion, ejecutivos] = await Promise.all([
    getPolizasListado({
      q,
      ramo,
      faltaContacto: soloFaltaContacto,
      ejecutivo: ejecutivo || undefined,
      canceladas: estatus === "" ? undefined : estatus === "canceladas",
    }),
    getRecibosListado(filtroRecibos),
    getEstadoConciliacion(),
    // Un ejecutivo que solo ve su cartera no filtra por ejecutivo.
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
  ]);
  return (
    <VistaPolizas
      listado={listado}
      listadoRecibos={listadoRecibos}
      conciliacion={conciliacion}
      ejecutivos={ejecutivos}
      filtros={{ q, ramo, soloFaltaContacto, ejecutivo, estatus, filtroRecibos, pestana }}
      usuario={{ id: user.id, soloSuCartera: user.soloSuCartera, verComisiones: veComisiones(user) }}
      hoy={hoyISO()}
    />
  );
}
