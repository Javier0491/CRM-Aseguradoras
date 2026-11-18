import { agenciaDelRobot, guardarPdf } from "@/lib/cotizador/robot";
import { MAX_BYTES_PDF } from "@/lib/cotizador/reglas";

// El robot cotizador sube aquí el PDF oficial de la aseguradora de una cotización que ya devolvió
// (estado LISTA): POST /api/cotizador/robot/pdf?id=<id> con el PDF tal cual en el cuerpo
// (Content-Type: application/pdf). Misma llave que /api/cotizador/robot.

const respuesta = (cuerpo: Record<string, unknown>, status = 200) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const agenciaId = await agenciaDelRobot(request.headers.get("authorization"));
  if (!agenciaId) return respuesta({ ok: false, error: "Llave del robot inválida o revocada." }, 401);

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return respuesta({ ok: false, error: "Falta el id de la cotización." }, 400);

  // Se rechaza antes de leer el cuerpo si dice que es demasiado grande.
  const largo = Number(request.headers.get("content-length") ?? "0");
  if (largo > MAX_BYTES_PDF) return respuesta({ ok: false, error: "El PDF es demasiado grande." }, 413);

  let contenido: Uint8Array;
  try {
    contenido = new Uint8Array(await request.arrayBuffer());
  } catch {
    return respuesta({ ok: false, error: "No se pudo leer el archivo." }, 400);
  }

  try {
    const r = await guardarPdf(agenciaId, id, contenido);
    if (!r.ok) return respuesta({ ok: false, error: r.error }, r.status);
    return respuesta({ ok: true, bytes: r.bytes });
  } catch (e) {
    console.error("[cotizador/robot/pdf]", e instanceof Error ? e.message : e);
    return respuesta({ ok: false, error: "No se pudo guardar el PDF." }, 500);
  }
}
