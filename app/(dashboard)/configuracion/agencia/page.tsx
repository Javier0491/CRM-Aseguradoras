import type { Metadata } from "next";

import { AgenciaForm } from "@/components/configuracion/agencia-form";
import { getAgencia } from "@/lib/agencias/queries";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Mi agencia",
};

export default async function MiAgenciaPage() {
  const { agenciaId } = await requireAdmin();
  const agencia = await getAgencia(agenciaId);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mi agencia</h1>
        <p className="text-sm text-muted-foreground">Nombre, logo y color con los que tu equipo ve la plataforma.</p>
      </div>
      <AgenciaForm agencia={agencia} />
    </>
  );
}
