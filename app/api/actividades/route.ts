import { getCurrentUser } from "@/lib/auth/dal";
import { getMisActividadesPendientes } from "@/lib/tareas/queries";

/**
 * GET /api/actividades — mis actividades de póliza sin finalizar, para el recordatorio insistente.
 * También para quien solo usa Tareas (puede ser la encargada del trámite), que no abre pólizas.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ total: 0, actividades: [], verPolizas: false }, { status: 401 });
  return Response.json({ ...(await getMisActividadesPendientes(user)), verPolizas: !user.soloTareas });
}
