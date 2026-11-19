// Portales que el robot sabe manejar. Cada uno exporta un objeto con:
//
//   clave            "QUALITAS" (igual que en el CRM)
//   nombre           para avisos
//   urlGuardia       página inofensiva que se recarga para mantener viva la sesión
//   mantenerCadaMin  cada cuánto se recarga (menos que lo que tarda el portal en cerrar por inactividad)
//   estaDentro(page) ¿la página muestra el portal con sesión? (sin navegar)
//   mantener(page)   recarga urlGuardia y dice si sigue dentro                       (nivel 2)
//   camposClave      qué pide su pantalla de entrada [{ clave, etiqueta, secreta }]
//   entrar(page, c)  intenta entrar con las claves → { ok } o { ok:false, motivo, mensaje }  (nivel 3)
//   cotizar          { AUTOS?: fn, GMM?: fn } → (page, datos, ctx) => { resultado, pdf? }
//
// Para agregar una aseguradora: crear portales/<nombre>.mjs con esa forma y sumarla aquí. Mientras un
// portal no tenga `cotizar`, el skill de Claude puede seguir cotizándolo: el robot nuevo solo pide al
// CRM las aseguradoras que sabe cotizar.

import qualitas from "./qualitas.mjs";

export const PORTALES = [qualitas];

export const porClave = (clave) => PORTALES.find((p) => p.clave === clave) ?? null;
