import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { ComunicacionesWorkspace } from "@/components/comunicaciones/comunicaciones-workspace";
import { plantillasIniciales, recibosPorCobrar } from "@/lib/comunicaciones/data";

export const metadata: Metadata = {
  title: "Comunicaciones",
};

export default function ComunicacionesPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Avisos de Cobranza <Badge variant="outline" className="ml-2 border-warning/30 bg-warning/10 align-middle text-[11px] font-medium text-warning">Datos de ejemplo</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestiona recordatorios de pago y las plantillas de correo que reciben tus clientes.
        </p>
      </div>
      <ComunicacionesWorkspace recibos={recibosPorCobrar} plantillasIniciales={plantillasIniciales} />
    </>
  );
}
