import type { Metadata } from "next";
import { cookies } from "next/headers";

import { VistaClientes } from "@/components/clientes/vista-clientes";
import { requireUsuarioCrm } from "@/lib/auth/dal";
import { getClientesListado, LIMITE_CLIENTES } from "@/lib/clientes/queries";
import { hoyISO } from "@/lib/format";
import { getEjecutivos } from "@/lib/usuarios/queries";
import { cookieVista, vistaDe } from "@/lib/vista-listado";

export const metadata: Metadata = {
  title: "Directorio de Clientes",
};

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const ejecutivo = typeof params.ejecutivo === "string" ? params.ejecutivo.slice(0, 64) : "";
  const user = await requireUsuarioCrm();
  const [listado, ejecutivos, galletas] = await Promise.all([
    getClientesListado(q, ejecutivo || undefined),
    // Un ejecutivo que solo ve su cartera no filtra por ejecutivo.
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
    cookies(),
  ]);

  return (
    <VistaClientes
      listado={listado}
      ejecutivos={ejecutivos}
      filtros={{ q, ejecutivo }}
      usuarioId={user.id}
      vista={vistaDe(galletas.get(cookieVista("clientes"))?.value)}
      limite={LIMITE_CLIENTES}
      hoy={hoyISO()}
    />
  );
}
