import type { Metadata } from "next";
import { BadgeDollarSign } from "lucide-react";

import { AlertasPlataforma } from "@/components/superadmin/alertas-plataforma";
import { CobranzaPlataforma, detalleCobro } from "@/components/superadmin/cobranza-plataforma";
import { LobbyAgencias } from "@/components/superadmin/lobby-agencias";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgenciasParaSuperadmin } from "@/lib/agencias/queries";
import { requireSuperadmin } from "@/lib/auth/dal";
import { formatNumero, hoyISO } from "@/lib/format";
import { getAlertasPlataforma } from "@/lib/plataforma/alertas";
import { ETIQUETA_ESTADO_COBRO } from "@/lib/plataforma/cobranza";
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
  // Estado de pago en cada tarjeta, solo cuando requiere atención.
  const cobros = Object.fromEntries(
    cobranza
      .filter((c) => c.estado === "por_vencer" || c.estado === "vencida" || c.estado === "suspendible")
      .map((c) => [c.id, { estado: c.estado, etiqueta: ETIQUETA_ESTADO_COBRO[c.estado], detalle: detalleCobro(c) }])
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis agencias</h1>
        <p className="text-sm text-muted-foreground">
          {formatNumero(agencias.length)} {agencias.length === 1 ? "CRM" : "CRMs"} en la plataforma. Elige uno para
          operarlo como superadministrador.
        </p>
      </div>
      <AlertasPlataforma alertas={alertas} />
      <LobbyAgencias agencias={agencias} activaId={user.agenciaId} propiaId={user.agenciaPropiaId} cobros={cobros} />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeDollarSign className="size-4 text-primary" /> Cobranza de la plataforma
          </CardTitle>
          <CardDescription>
            Cuota de cada agencia y hasta cuándo está pagada. La tarea diaria avisa antes de vencer y, si lo activas,
            suspende al pasar la tolerancia; al registrar el pago se reactiva.
          </CardDescription>
        </CardHeader>
        <CobranzaPlataforma agencias={cobranza} hoy={hoyISO()} />
      </Card>
    </>
  );
}
