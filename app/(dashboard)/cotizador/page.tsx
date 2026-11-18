import type { Metadata } from "next";
import { Calculator } from "lucide-react";

import { ConexionesAseguradoras } from "@/components/cotizador/conexiones-aseguradoras";
import { FormularioCotizacion } from "@/components/cotizador/formulario-cotizacion";
import { ListaCotizaciones } from "@/components/cotizador/lista-cotizaciones";
import { PanelRobot } from "@/components/cotizador/panel-robot";
import { RamoPendiente, ramoDeParametro, SelectorRamo } from "@/components/cotizador/ramos";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { esAdmin, requireUsuarioCrm } from "@/lib/auth/dal";
import { aseguradorasDelRamo, RAMOS_CON_FORMULARIO } from "@/lib/cotizador/aseguradoras";
import { getConfigCanales, getEstadoRobot, getSolicitudes } from "@/lib/cotizador/queries";
import { hoyISO } from "@/lib/format";

export const metadata: Metadata = {
  title: "Multicotizador",
};

export default async function MulticotizadorPage({ searchParams }: PageProps<"/cotizador">) {
  const user = await requireUsuarioCrm();
  const ramo = ramoDeParametro((await searchParams).ramo);
  const admin = esAdmin(user);
  const config = await getConfigCanales(user.agenciaId);
  const aseguradoras = aseguradorasDelRamo(ramo, config);
  const conFormulario = RAMOS_CON_FORMULARIO.includes(ramo);
  const [solicitudes, estado] = conFormulario
    ? await Promise.all([getSolicitudes(user), getEstadoRobot(user.agenciaId)])
    : [[], null];

  return (
    <>
      <EncabezadoModulo
        icono={Calculator}
        titulo="Multicotizador"
        descripcion="Captura los datos una vez y cotiza en todas las aseguradoras conectadas: por robot (el portal con la sesión de la oficina) o por API."
      />
      <SelectorRamo actual={ramo} />
      {conFormulario && estado ? (
        <>
          <PanelRobot estado={estado} esAdmin={admin} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <FormularioCotizacion hoy={hoyISO()} aseguradoras={aseguradoras} />
            <ListaCotizaciones solicitudes={solicitudes} />
          </div>
        </>
      ) : (
        <RamoPendiente ramo={ramo} />
      )}
      <ConexionesAseguradoras ramo={ramo} aseguradoras={aseguradoras} esAdmin={admin} />
    </>
  );
}
