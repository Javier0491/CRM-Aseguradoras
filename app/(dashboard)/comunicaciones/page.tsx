import type { Metadata } from "next";

import { ComunicacionesWorkspace } from "@/components/comunicaciones/comunicaciones-workspace";
import { plantillasIniciales, recibosPorCobrar } from "@/lib/comunicaciones/data";

export const metadata: Metadata = {
  title: "Comunicaciones",
};

export default function ComunicacionesPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Avisos de Cobranza</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona recordatorios de pago y las plantillas de correo que reciben tus clientes.
        </p>
      </div>
      <ComunicacionesWorkspace recibos={recibosPorCobrar} plantillasIniciales={plantillasIniciales} />
    </>
  );
}
