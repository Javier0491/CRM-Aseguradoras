import type { Metadata } from "next";
import { cookies } from "next/headers";

import { esPestana, esRamo, VistaPolizas } from "@/components/polizas/vista-polizas";
import { requireUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import { getEstadoConciliacion } from "@/lib/polizas/conciliacion";
import {
  esEstatusPolizas,
  esFiltroContacto,
  esFiltroRecibos,
  getAseguradorasOpciones,
  getPolizasListado,
  getRecibosListado,
} from "@/lib/polizas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";
import { cookieVista, vistaDe } from "@/lib/vista-listado";

export const metadata: Metadata = {
  title: "Pólizas",
};

export default async function PolizasPage({ searchParams }: PageProps<"/polizas">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const ramo = esRamo(params.ramo) ? params.ramo : undefined;
  const contacto = esFiltroContacto(params.contacto) ? params.contacto : "";
  const ejecutivo = typeof params.ejecutivo === "string" ? params.ejecutivo.slice(0, 64) : "";
  const estatus = esEstatusPolizas(params.estatus) ? params.estatus : "";
  const aseguradora = typeof params.aseguradora === "string" ? params.aseguradora.slice(0, 64) : "";
  const filtroRecibos = esFiltroRecibos(params.recibos) ? params.recibos : "todos";
  const pestana = esPestana(params.tab) ? params.tab : "polizas";

  const user = await requireUsuarioCrm();
  const [listado, listadoRecibos, conciliacion, ejecutivos, aseguradoras, galletas] = await Promise.all([
    getPolizasListado({
      q,
      ramo,
      faltaContacto: contacto || undefined,
      ejecutivo: ejecutivo || undefined,
      estatus,
      aseguradora: aseguradora || undefined,
    }),
    getRecibosListado(filtroRecibos),
    getEstadoConciliacion(),
    // Un ejecutivo que solo ve su cartera no filtra por ejecutivo.
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
    getAseguradorasOpciones(),
    cookies(),
  ]);
  const vista = vistaDe(galletas.get(cookieVista("polizas"))?.value);
  return (
    <VistaPolizas
      listado={listado}
      listadoRecibos={listadoRecibos}
      conciliacion={conciliacion}
      ejecutivos={ejecutivos}
      aseguradoras={aseguradoras.map((a) => ({ value: a.value, label: a.label }))}
      filtros={{ q, ramo, contacto, ejecutivo, estatus, aseguradora, filtroRecibos, pestana, vista }}
      usuario={{ id: user.id, soloSuCartera: user.soloSuCartera, verComisiones: veComisiones(user) }}
      hoy={hoyISO()}
    />
  );
}
