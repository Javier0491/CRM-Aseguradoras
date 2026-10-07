import type { Metadata } from "next";

import { VistaRenovaciones } from "@/components/renovaciones/vista-renovaciones";
import { getAgencia } from "@/lib/agencias/queries";
import { requireUsuarioCrm } from "@/lib/auth/dal";
import { getEmbudo } from "@/lib/renovaciones/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Renovaciones",
};

export default async function RenovacionesPage({ searchParams }: PageProps<"/renovaciones">) {
  const params = await searchParams;
  const ejecutivo = typeof params.ejecutivo === "string" ? params.ejecutivo.slice(0, 64) : "";
  const user = await requireUsuarioCrm();
  const [embudo, ejecutivos, agencia] = await Promise.all([
    getEmbudo({ ejecutivo: ejecutivo || undefined }),
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
    getAgencia(user.agenciaId),
  ]);
  return (
    <VistaRenovaciones
      embudo={embudo}
      agencia={agencia.nombre}
      filtro={ejecutivos && { ejecutivos, usuarioId: user.id, valor: ejecutivo }}
    />
  );
}
