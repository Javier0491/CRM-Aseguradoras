import type { Metadata } from "next";

import { VistaDashboard } from "@/components/dashboard/vista-dashboard";
import { getAgencia } from "@/lib/agencias/queries";
import { puedeConciliar, requireUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { esPeriodo, PERIODO_PREDETERMINADO } from "@/lib/dashboard/periodos";
import { getDashboard, getParaHoy } from "@/lib/dashboard/queries";
import { getEquipo } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const { periodo: periodoParam } = await searchParams;
  const periodo = esPeriodo(periodoParam) ? periodoParam : PERIODO_PREDETERMINADO;

  const user = await requireUsuarioCrm();
  // Las comisiones solo las ve el SUPERADMIN; la conciliación de cobranza, el rol ADMIN.
  const verComisiones = veComisiones(user);
  const [dashboard, paraHoy, agencia, equipo] = await Promise.all([
    getDashboard(periodo, { incluirComisiones: verComisiones }),
    getParaHoy(user),
    getAgencia(user.agenciaId),
    user.soloSuCartera ? Promise.resolve(undefined) : getEquipo(user.agenciaId),
  ]);
  return (
    <VistaDashboard
      dashboard={dashboard}
      paraHoy={paraHoy}
      agencia={agencia.nombre}
      equipo={equipo}
      periodo={periodo}
      usuario={{
        id: user.id,
        email: user.email,
        soloSuCartera: user.soloSuCartera,
        verComisiones,
        verConciliacion: puedeConciliar(user),
        coordinaTareas: user.coordinaTareas,
      }}
    />
  );
}
