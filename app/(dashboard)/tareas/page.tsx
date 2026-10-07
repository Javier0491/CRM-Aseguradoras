import type { Metadata } from "next";

import { VistaTareasPagina } from "@/components/tareas/vista-tareas";
import { requireUser } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";
import {
  esVistaTareas,
  getAvanceEquipo,
  getMiResumen,
  getTareas,
  LIMITE_TAREAS,
  type VistaTareas,
} from "@/lib/tareas/queries";
import { getEquipo } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Tareas",
};

export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  const params = await searchParams;
  // La única página que abren la Ejecutiva de operación, el Líder de oficina y el Auxiliar.
  const user = await requireUser();
  // La vista del equipo: quien coordina y quien opera toda la cartera; no la Ejecutiva de
  // operación ni el Auxiliar (ven las suyas) ni el ejecutivo que solo ve su cartera.
  const conEquipo = user.coordinaTareas || (!user.soloTareas && !user.soloSuCartera);
  const vista: VistaTareas =
    esVistaTareas(params.vista) && (params.vista !== "todas" || conEquipo) ? params.vista : "mias";
  const [{ tareas, total }, resumen, equipo, avance] = await Promise.all([
    getTareas(vista),
    getMiResumen(user),
    user.soloSuCartera ? Promise.resolve(undefined) : getEquipo(user.agenciaId),
    user.coordinaTareas ? getAvanceEquipo(user) : Promise.resolve(null),
  ]);

  return (
    <VistaTareasPagina
      usuario={{
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        soloTareas: user.soloTareas,
        coordinaTareas: user.coordinaTareas,
      }}
      vista={vista}
      conEquipo={conEquipo}
      tareas={tareas}
      total={total}
      limite={LIMITE_TAREAS}
      resumen={resumen}
      equipo={equipo}
      avance={avance}
      hoy={hoyISO()}
    />
  );
}
