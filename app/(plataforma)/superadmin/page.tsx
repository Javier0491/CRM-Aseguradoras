import type { Metadata } from "next";

import { LobbyAgencias } from "@/components/superadmin/lobby-agencias";
import { getAgenciasParaSuperadmin } from "@/lib/agencias/queries";
import { requireSuperadmin } from "@/lib/auth/dal";
import { formatNumero } from "@/lib/format";

export const metadata: Metadata = {
  title: "Mis agencias",
};

export default async function SuperadminPage() {
  const user = await requireSuperadmin();
  const agencias = await getAgenciasParaSuperadmin();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis agencias</h1>
        <p className="text-sm text-muted-foreground">
          {formatNumero(agencias.length)} {agencias.length === 1 ? "CRM" : "CRMs"} en la plataforma. Elige uno para
          operarlo como superadministrador.
        </p>
      </div>
      <LobbyAgencias agencias={agencias} activaId={user.agenciaId} propiaId={user.agenciaPropiaId} />
    </>
  );
}
