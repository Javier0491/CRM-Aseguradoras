import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VistaCliente } from "@/components/clientes/vista-cliente";
import { getAgencia } from "@/lib/agencias/queries";
import { esAdmin, requireUsuarioCrm } from "@/lib/auth/dal";
import { getClienteExpediente, getPosiblesDuplicados } from "@/lib/clientes/queries";
import { hoyISO } from "@/lib/format";
import { getTareasDe } from "@/lib/tareas/queries";
import { getEjecutivos, getEquipo } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Expediente del cliente",
};

export default async function ClienteExpedientePage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const cliente = await getClienteExpediente(id);
  if (!cliente) notFound();
  const user = await requireUsuarioCrm();
  const admin = esAdmin(user);
  const [tareas, ejecutivos, equipo, duplicados, agencia] = await Promise.all([
    getTareasDe({ clienteId: cliente.id }),
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
    user.soloSuCartera ? Promise.resolve(undefined) : getEquipo(user.agenciaId),
    admin ? getPosiblesDuplicados(cliente) : Promise.resolve([]),
    getAgencia(user.agenciaId),
  ]);
  return (
    <VistaCliente
      cliente={cliente}
      tareas={tareas}
      ejecutivos={ejecutivos}
      equipo={equipo}
      duplicados={duplicados}
      agencia={agencia.nombre}
      usuario={{ id: user.id, email: user.email, admin, coordinaTareas: user.coordinaTareas }}
      hoy={hoyISO()}
    />
  );
}
