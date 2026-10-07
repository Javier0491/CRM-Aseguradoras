import { getCurrentUser } from "@/lib/auth/dal";
import { conversacionDe, getMensajes, getMiembrosChat, getResumenChat } from "@/lib/mensajes/queries";
import type { RespuestaChat } from "@/lib/mensajes/reglas";

const ID = /^[\w-]{1,64}$/;

/**
 * GET /api/mensajes — lo que consulta el chat del encabezado cada pocos segundos: las
 * conversaciones con sus no leídos y, si se indica `conversacion`, sus mensajes más recientes;
 * con `miembros=1`, también con quién se puede iniciar una conversación. Lo usa todo el equipo,
 * también quien solo usa Tareas.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "No autenticado." } satisfies RespuestaChat, { status: 401 });

  const params = new URL(request.url).searchParams;
  const conversacion = params.get("conversacion");
  const [resumen, abierta, miembros] = await Promise.all([
    getResumenChat(user),
    conversacion && ID.test(conversacion)
      ? conversacionDe(user, conversacion).then(async (c) => (c ? { id: c.id, ...(await getMensajes(c.id)) } : undefined))
      : Promise.resolve(undefined),
    params.get("miembros") === "1" ? getMiembrosChat(user) : Promise.resolve(undefined),
  ]);

  return Response.json(
    { ok: true, yo: user.id, ...resumen, ...(abierta && { abierta }), ...(miembros && { miembros }) } satisfies RespuestaChat,
    { headers: { "Cache-Control": "no-store" } }
  );
}
