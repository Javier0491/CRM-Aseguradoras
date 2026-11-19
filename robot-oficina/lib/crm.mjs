// Conversación con ZenSecure. Es la misma API que usaba el skill de Claude:
//   GET  /api/cotizador/robot?aseguradoras=…   → siguiente solicitud (o null)
//   POST /api/cotizador/robot                  → { id, resultado } o { id, error }
//   POST /api/cotizador/robot/pdf?id=…         → PDF oficial de la aseguradora
//   POST /api/cotizador/robot/estado           → qué portales tienen sesión en esta oficina
// La llave viaja solo en el encabezado Authorization; nunca en la URL ni en la bitácora.

import { leerLlave, urlCrm, VERSION } from "./config.mjs";

export class LlaveInvalida extends Error {}

function encabezados(extra = {}) {
  const llave = leerLlave();
  if (!llave) throw new LlaveInvalida("No hay llave del robot.");
  return { Authorization: `Bearer ${llave}`, "User-Agent": `ZenSecure-robot/${VERSION}`, ...extra };
}

async function llamar(ruta, opciones = {}) {
  const r = await fetch(urlCrm() + ruta, { ...opciones, signal: AbortSignal.timeout(30_000) });
  if (r.status === 401) throw new LlaveInvalida("La llave del robot es inválida o la revocaron.");
  let cuerpo = null;
  try {
    cuerpo = await r.json();
  } catch {
    // sin JSON
  }
  return { status: r.status, cuerpo };
}

/** Siguiente solicitud pendiente de esas aseguradoras, o null. */
export async function pedirTrabajo(aseguradoras) {
  if (aseguradoras.length === 0) return null;
  const q = encodeURIComponent(aseguradoras.join(","));
  const { status, cuerpo } = await llamar(`/api/cotizador/robot?aseguradoras=${q}`, { headers: encabezados() });
  if (status !== 200 || !cuerpo?.ok) throw new Error(`El CRM respondió ${status}: ${cuerpo?.error ?? "sin detalle"}`);
  return cuerpo.solicitud ?? null;
}

/** Devuelve el resultado; true si quedó guardado. 409 = la cancelaron mientras tanto. */
export async function devolver(id, salida) {
  const { status, cuerpo } = await llamar("/api/cotizador/robot", {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id, ...salida }),
  });
  if (status === 200) return { ok: true };
  return { ok: false, status, error: cuerpo?.error ?? `HTTP ${status}` };
}

export async function subirPdf(id, bytes) {
  const { status, cuerpo } = await llamar(`/api/cotizador/robot/pdf?id=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/pdf" }),
    body: bytes,
  });
  return status === 200 ? { ok: true } : { ok: false, error: cuerpo?.error ?? `HTTP ${status}` };
}

/**
 * Le dice al CRM qué portales tienen sesión, para que la oficina lo vea en Multicotizador →
 * Conexiones. Responde con las aseguradoras que la agencia tiene en «Robot» (o null si el CRM
 * todavía no tiene este servicio).
 */
export async function reportarEstado(portales) {
  try {
    const { status, cuerpo } = await llamar("/api/cotizador/robot/estado", {
      method: "POST",
      headers: encabezados({ "Content-Type": "application/json" }),
      body: JSON.stringify({ version: VERSION, portales }),
    });
    if (status !== 200 || !cuerpo?.ok) return null;
    return Array.isArray(cuerpo.aseguradorasRobot) ? cuerpo.aseguradorasRobot : null;
  } catch (e) {
    if (e instanceof LlaveInvalida) throw e;
    return null;
  }
}
