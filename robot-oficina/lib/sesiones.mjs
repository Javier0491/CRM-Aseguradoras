// NIVEL 1 — que reiniciar la computadora no cierre las sesiones.
//
// El Chrome del robot usa un perfil propio y fijo (DIR_PERFIL), así que las cookies con fecha de
// vencimiento ya sobreviven solas. Las «cookies de sesión» (sin fecha) Chrome las borra al cerrarse,
// y muchos portales guardan ahí el inicio de sesión. Por eso el robot las copia cada pocos minutos,
// cifradas con DPAPI, y las vuelve a poner al arrancar. Si el portal ya las dio por vencidas del lado
// de su servidor, no pasa nada: la guardia lo detecta y sigue con los niveles 2 y 3.

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";

import { ARCHIVO_COOKIES } from "./config.mjs";
import { cifrar, descifrar, hayCifrado } from "./cifrado.mjs";
import { registrar } from "./avisos.mjs";

/** Las cookies que Chrome no guarda solo: las de sesión (expires = -1). */
const deSesion = (c) => !(c.expires > 0);

export async function guardarCookiesDeSesion(context) {
  if (!hayCifrado) return 0;
  const cookies = (await context.cookies()).filter(deSesion);
  const temporal = ARCHIVO_COOKIES + ".nuevo";
  writeFileSync(temporal, cifrar(JSON.stringify({ guardadas: new Date().toISOString(), cookies })));
  renameSync(temporal, ARCHIVO_COOKIES);
  return cookies.length;
}

export async function restaurarCookiesDeSesion(context) {
  if (!hayCifrado || !existsSync(ARCHIVO_COOKIES)) return 0;
  try {
    const { cookies } = JSON.parse(descifrar(readFileSync(ARCHIVO_COOKIES, "utf8")));
    const yaEstan = new Set((await context.cookies()).map((c) => `${c.domain}|${c.path}|${c.name}`));
    const faltan = cookies.filter((c) => !yaEstan.has(`${c.domain}|${c.path}|${c.name}`));
    if (faltan.length) await context.addCookies(faltan);
    return faltan.length;
  } catch (e) {
    registrar("No se pudieron restaurar las sesiones guardadas:", e instanceof Error ? e.message : e);
    return 0;
  }
}
