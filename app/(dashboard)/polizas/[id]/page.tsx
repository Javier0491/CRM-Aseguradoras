import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VistaPoliza } from "@/components/polizas/vista-poliza";
import { getAgencia } from "@/lib/agencias/queries";
import { requireUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { getHistorialPoliza } from "@/lib/bitacora/historial-poliza";
import { hoyISO } from "@/lib/format";
import { getPolizaAnterior, getRenovacion } from "@/lib/polizas/formulario";
import { getPolizaDetalle } from "@/lib/polizas/queries";
import { getTareasDe } from "@/lib/tareas/queries";
import { getEquipo } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Detalle de póliza",
};

export default async function PolizaDetallePage({ params }: PageProps<"/polizas/[id]">) {
  const { id } = await params;
  const poliza = await getPolizaDetalle(id);
  if (!poliza) notFound();
  const user = await requireUsuarioCrm();
  // La comisión solo la ve el SUPERADMIN.
  const verComisiones = veComisiones(user);
  const [renovada, anterior, historial, tareas, equipo, agencia] = await Promise.all([
    getRenovacion(poliza),
    getPolizaAnterior(poliza),
    getHistorialPoliza(poliza, verComisiones),
    getTareasDe({ polizaId: poliza.id }),
    user.soloSuCartera ? Promise.resolve(undefined) : getEquipo(user.agenciaId),
    getAgencia(user.agenciaId),
  ]);
  return (
    <VistaPoliza
      poliza={poliza}
      renovada={renovada}
      anterior={anterior}
      historial={historial}
      tareas={tareas}
      equipo={equipo}
      agencia={agencia.nombre}
      usuario={{ id: user.id, email: user.email, verComisiones, coordinaTareas: user.coordinaTareas }}
      hoy={hoyISO()}
    />
  );
}
