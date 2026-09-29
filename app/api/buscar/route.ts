import { getCurrentUser } from "@/lib/auth/dal";
import { buscarGlobal } from "@/lib/busqueda/queries";

/** GET /api/buscar?q=… — resultados del buscador del encabezado. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ resultados: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ resultados: await buscarGlobal(user.agenciaId, q) });
}
