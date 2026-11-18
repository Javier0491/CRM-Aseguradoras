import type { Metadata } from "next";
import { Calculator } from "lucide-react";

import { FormularioCotizacion } from "@/components/cotizador/formulario-cotizacion";
import { ListaCotizaciones } from "@/components/cotizador/lista-cotizaciones";
import { PanelRobot } from "@/components/cotizador/panel-robot";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { esAdmin, requireUsuarioCrm } from "@/lib/auth/dal";
import { getEstadoRobot, getSolicitudes } from "@/lib/cotizador/queries";
import { hoyISO } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cotizador de Autos",
};

export default async function CotizadorPage() {
  const user = await requireUsuarioCrm();
  const [solicitudes, estado] = await Promise.all([getSolicitudes(user), getEstadoRobot(user.agenciaId)]);

  return (
    <>
      <EncabezadoModulo
        icono={Calculator}
        titulo="Cotizador de Autos"
        descripcion="El robot de la oficina entra al portal de la aseguradora con la sesión abierta, cotiza y deja aquí el precio."
      />
      <PanelRobot estado={estado} esAdmin={esAdmin(user)} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FormularioCotizacion hoy={hoyISO()} />
        <ListaCotizaciones solicitudes={solicitudes} />
      </div>
    </>
  );
}
