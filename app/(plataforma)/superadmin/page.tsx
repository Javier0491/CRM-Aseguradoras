import type { Metadata } from "next";

import { VistaSuperadmin } from "@/components/superadmin/vista-superadmin";
import { getAgenciasParaSuperadmin } from "@/lib/agencias/queries";
import { requireSuperadmin } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import { getAlertasPlataforma } from "@/lib/plataforma/alertas";
import { getCobranzaAgencias } from "@/lib/plataforma/queries";

export const metadata: Metadata = {
  title: "Mis agencias",
};

export default async function SuperadminPage() {
  const user = await requireSuperadmin();
  const [agencias, cobranza, alertas] = await Promise.all([
    getAgenciasParaSuperadmin(),
    getCobranzaAgencias(),
    getAlertasPlataforma(),
  ]);
  return (
    <VistaSuperadmin
      agencias={agencias}
      cobranza={cobranza}
      alertas={alertas}
      activaId={user.agenciaId}
      propiaId={user.agenciaPropiaId}
      hoy={hoyISO()}
    />
  );
}
