// Dónde vive cada cosa del robot y cada cuánto hace cada tarea.
//
// - La llave del robot y la dirección del CRM están en %USERPROFILE%\.zensecure (las mismas que usaba
//   el skill de Claude), para que el robot nuevo y el viejo compartan configuración.
// - El perfil de Chrome, las cookies y las claves de los portales viven en %LOCALAPPDATA%\ZenSecure\robot:
//   NUNCA dentro de OneDrive (se sincronizaría a otras máquinas y Chrome bloquea su perfil).

import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const VERSION = "0.1.0";

export const DIR_CONFIG = join(homedir(), ".zensecure");

const base = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share");
export const DIR_DATOS = process.env.ZS_ROBOT_DATOS ?? join(base, "ZenSecure", "robot");
export const DIR_PERFIL = join(DIR_DATOS, "perfil-chrome");
export const DIR_CLAVES = join(DIR_DATOS, "claves");
export const ARCHIVO_COOKIES = join(DIR_DATOS, "sesiones.dat");
export const ARCHIVO_LOG = join(DIR_DATOS, "robot.log");

export function prepararCarpetas() {
  for (const d of [DIR_DATOS, DIR_PERFIL, DIR_CLAVES]) mkdirSync(d, { recursive: true });
}

function leerTexto(ruta) {
  try {
    return readFileSync(ruta, "utf8").replace(/[\r\n\s]+/g, "");
  } catch {
    return null;
  }
}

/** Llave del robot (zsr_…). La genera un administrador en ZenSecure → Multicotizador. */
export function leerLlave() {
  return process.env.ZS_ROBOT_LLAVE ?? leerTexto(join(DIR_CONFIG, "robot-cotizador.txt"));
}

export function urlCrm() {
  const url = process.env.ZS_CRM_URL ?? leerTexto(join(DIR_CONFIG, "crm-url.txt")) ?? "https://crm-aseguradoras-eight.vercel.app";
  return url.replace(/\/+$/, "");
}

/** Tiempos (en segundos salvo que diga otra cosa). */
export const TIEMPOS = {
  /** Cada cuánto pregunta al CRM si hay cotizaciones nuevas cuando no hay trabajo. */
  pedirTrabajo: 15,
  /** Cada cuánto revisa la guardia si toca mantener viva alguna sesión. */
  guardia: 60,
  /** Cada cuánto guarda las cookies de sesión cifradas (nivel 1). */
  guardarCookies: 120,
  /** Cada cuánto le dice al CRM qué portales tienen sesión. */
  reportarEstado: 120,
  /** No repetir el mismo aviso de Windows antes de esto (minutos). */
  repetirAviso: 30,
  /** Tiempo máximo para una cotización (minutos); el CRM la retoma a los 20. */
  maxCotizacion: 12,
};

/**
 * Puerto para inspeccionar el Chrome del robot desde esta misma computadora (solo para quien lo
 * programa). Apagado salvo que se pida con ZS_DEPURAR=9333.
 */
export const PUERTO_DEPURACION = process.env.ZS_DEPURAR ? Number(process.env.ZS_DEPURAR) : null;
