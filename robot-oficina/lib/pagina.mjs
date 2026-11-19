// Herramientas comunes para manejar páginas de los portales.

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Error que el robot convierte en mensaje para el ejecutivo (no es un fallo del programa). */
export class ErrorCotizacion extends Error {}

/** La sesión del portal se cerró a media cotización: la guardia intenta reentrar y se reintenta. */
export class SesionCerrada extends Error {}

/**
 * Anula los avisos emergentes del portal (alert/confirm) en todas las cargas de la página: si no, la
 * pestaña se congela. Lo que dijo el portal queda en window.__alertas. Playwright además acepta
 * cualquier diálogo que se escape.
 */
export async function anularAlertas(page) {
  await page.addInitScript(() => {
    window.__alertas = [];
    window.alert = (m) => window.__alertas.push(String(m));
    window.confirm = (m) => (window.__alertas.push(String(m)), false);
  });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
}

/** "$10,339.32" → 10339.32 ; null si no hay número. */
export function aNumero(texto) {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).replace(/[^0-9.\-]/g, "");
  if (!limpio || limpio === "." || limpio === "-") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Quita acentos, espacios dobles y pasa a mayúsculas, para comparar textos del portal. */
export function normalizar(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, " ")
    .trim();
}

/** Edad cumplida hoy desde yyyy-mm-dd. */
export function edad(fechaNacimiento, hoy = new Date()) {
  const [a, m, d] = fechaNacimiento.split("-").map(Number);
  const ha = hoy.getFullYear();
  const hm = hoy.getMonth() + 1;
  const hd = hoy.getDate();
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

/** yyyy-mm-dd → dd/mm/aaaa */
export const ddmmaaaa = (iso) => iso.split("-").reverse().join("/");

/**
 * Elige de una lista de opciones del portal la que mejor coincide con la versión pedida. Devuelve
 * { elegida, empatadas } — si no hay una clara, `elegida` es null y el robot devuelve las opciones al
 * ejecutivo en vez de adivinar.
 */
export function mejorOpcion(opciones, buscado, { transmision } = {}) {
  const palabras = normalizar(buscado).split(" ").filter(Boolean);
  const esAut = (t) => /\b(AUT|AUTOMATIC[AO]?|TA|CVT|DSG|TIPTRONIC)\b/.test(t);
  const esStd = (t) => /\b(STD|ESTANDAR|MANUAL|TM)\b/.test(t);
  const puntuadas = opciones.map((texto) => {
    const t = normalizar(texto);
    let puntos = 0;
    for (const p of palabras) if (new RegExp(`(^| )${p.replace(/\./g, "\\.")}( |$)`).test(t)) puntos += p.length > 2 ? 2 : 1;
    if (transmision === "AUT") puntos += esAut(t) ? 3 : esStd(t) ? -5 : 0;
    if (transmision === "STD") puntos += esStd(t) ? 3 : esAut(t) ? -5 : 0;
    return { texto, puntos };
  });
  puntuadas.sort((a, b) => b.puntos - a.puntos);
  const max = puntuadas[0]?.puntos ?? 0;
  const empatadas = puntuadas.filter((p) => p.puntos === max).map((p) => p.texto);
  return { elegida: max > 0 && empatadas.length === 1 ? empatadas[0] : null, empatadas, puntuadas };
}
