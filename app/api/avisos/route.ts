import { getUsuarioCrm } from "@/lib/auth/dal";
import { getAvisos } from "@/lib/busqueda/queries";

/** GET /api/avisos — pendientes para la campana del encabezado (se consultan al abrirla). */
export async function GET() {
  const user = await getUsuarioCrm();
  if (!user) return Response.json({ avisos: [] }, { status: 401 });
  return Response.json({ avisos: await getAvisos(user) });
}
