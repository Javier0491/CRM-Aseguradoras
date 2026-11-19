// NIVEL 3 — claves de los portales para volver a entrar solo.
//
// Las escribe una persona de la oficina con `npm run claves -- guardar QUALITAS` y quedan cifradas con
// DPAPI en DIR_CLAVES (solo ese usuario de Windows en esa computadora las puede leer). Nunca salen
// de la computadora: ni al CRM, ni a ZenSecure, ni a la bitácora.

import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { DIR_CLAVES } from "./config.mjs";
import { cifrar, descifrar, hayCifrado } from "./cifrado.mjs";

const ruta = (clave) => join(DIR_CLAVES, `${clave.replace(/[^A-Z0-9_]/g, "")}.dat`);

export function guardarClaves(clave, valores) {
  writeFileSync(ruta(clave), cifrar(JSON.stringify(valores)));
}

/** Los campos guardados del portal, o null si no hay (o no se pueden leer en esta computadora). */
export function leerClaves(clave) {
  if (!hayCifrado || !existsSync(ruta(clave))) return null;
  try {
    return JSON.parse(descifrar(readFileSync(ruta(clave), "utf8")));
  } catch {
    return null;
  }
}

/** Cuándo se guardaron por última vez (0 si no hay): sirve para notar que alguien las corrigió. */
export function fechaClaves(clave) {
  try {
    return statSync(ruta(clave)).mtimeMs;
  } catch {
    return 0;
  }
}

export function borrarClaves(clave) {
  if (existsSync(ruta(clave))) unlinkSync(ruta(clave));
}

export function portalesConClaves() {
  try {
    return readdirSync(DIR_CLAVES)
      .filter((f) => f.endsWith(".dat"))
      .map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}
