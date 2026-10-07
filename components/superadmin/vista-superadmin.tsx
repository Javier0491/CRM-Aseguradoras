import { BadgeDollarSign } from "lucide-react";

import { AlertasPlataforma } from "@/components/superadmin/alertas-plataforma";
import { CobranzaPlataforma } from "@/components/superadmin/cobranza-plataforma";
import { LobbyAgencias } from "@/components/superadmin/lobby-agencias";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgenciaLobby } from "@/lib/agencias/queries";
import { formatNumero } from "@/lib/format";
import type { getAlertasPlataforma } from "@/lib/plataforma/alertas";
import { detalleCobro, ETIQUETA_ESTADO_COBRO } from "@/lib/plataforma/cobranza";
import type { CobranzaAgencia } from "@/lib/plataforma/queries";

export type DatosSuperadmin = {
  agencias: AgenciaLobby[];
  cobranza: CobranzaAgencia[];
  alertas: Awaited<ReturnType<typeof getAlertasPlataforma>>;
  /** Agencia que opera ahora el superadministrador y la suya propia. */
  activaId: string;
  propiaId: string;
  hoy: string;
};

/** Lobby del superadministrador: sus agencias y la cobranza de la plataforma. La página carga los datos. */
export function VistaSuperadmin({ agencias, cobranza, alertas, activaId, propiaId, hoy }: DatosSuperadmin) {
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
      <LobbyAgencias agencias={agencias} activaId={activaId} propiaId={propiaId} cobros={cobros} />

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
        <CobranzaPlataforma agencias={cobranza} hoy={hoy} />
      </Card>
    </>
  );
}
