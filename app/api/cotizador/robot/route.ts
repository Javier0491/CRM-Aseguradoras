import { agenciaDelRobot, guardarResultado, tomarSiguiente } from "@/lib/cotizador/robot";
import { validarResultado } from "@/lib/cotizador/reglas";

// API del robot cotizador: la computadora de la oficina pide aquí la siguiente cotización
// pendiente y devuelve el resultado. Se autentica con la llave de la agencia
// (Authorization: Bearer zsr_…), que se genera en la pantalla Cotizador; no usa la sesión de
// ningún usuario.

const respuesta = (cuerpo: Record<string, unknown>, status = 200) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

const noAutorizado = () => respuesta({ ok: false, error: "Llave del robot inválida o revocada." }, 401);

/** GET: la siguiente solicitud pendiente (queda en COTIZANDO), o `solicitud: null` si no hay. */
export async function GET(request: Request) {
  const agenciaId = await agenciaDelRobot(request.headers.get("authorization"));
  if (!agenciaId) return noAutorizado();
  try {
    const solicitud = await tomarSiguiente(agenciaId);
    return respuesta({ ok: true, solicitud });
  } catch (e) {
    console.error("[cotizador/robot] GET", e instanceof Error ? e.message : e);
    return respuesta({ ok: false, error: "No se pudo leer la fila de cotizaciones." }, 500);
  }
}

/**
 * POST: resultado de una solicitud. Cuerpo JSON:
 * `{ id, resultado: ResultadoCotizacion }` si se cotizó, o `{ id, error: "por qué no" }`.
 */
export async function POST(request: Request) {
  const agenciaId = await agenciaDelRobot(request.headers.get("authorization"));
  if (!agenciaId) return noAutorizado();

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return respuesta({ ok: false, error: "El cuerpo debe ser JSON." }, 400);
  }
  if (typeof cuerpo?.id !== "string" || !cuerpo.id) return respuesta({ ok: false, error: "Falta el id." }, 400);

  let salida: Parameters<typeof guardarResultado>[2];
  if (typeof cuerpo.error === "string" && cuerpo.error.trim()) {
    salida = { error: cuerpo.error.trim().slice(0, 1000) };
  } else {
    const v = validarResultado(cuerpo.resultado);
    if (!v.ok) return respuesta({ ok: false, error: v.error }, 422);
    salida = { resultado: v.valor };
  }

  try {
    const guardado = await guardarResultado(agenciaId, cuerpo.id, salida);
    if (!guardado) {
      return respuesta({ ok: false, error: "La solicitud ya no está en proceso (¿la cancelaron?)." }, 409);
    }
    return respuesta({ ok: true });
  } catch (e) {
    console.error("[cotizador/robot] POST", e instanceof Error ? e.message : e);
    return respuesta({ ok: false, error: "No se pudo guardar el resultado." }, 500);
  }
}
