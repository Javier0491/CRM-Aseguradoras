import { createHash, randomBytes } from "node:crypto";

import { PREFIJO_LLAVE } from "@/lib/cotizador/reglas";

/** Llave nueva del robot cotizador. Solo se muestra una vez; en la base se guarda su hash. */
export function generarLlave(): string {
  return PREFIJO_LLAVE + randomBytes(32).toString("base64url");
}

/** SHA-256 de la llave (la llave es aleatoria y larga: no necesita sal ni un hash lento). */
export function hashLlave(llave: string): string {
  return createHash("sha256").update(llave).digest("hex");
}

/** La llave del encabezado `Authorization: Bearer zsr_…`, o null si no tiene la forma esperada. */
export function llaveDeEncabezado(authorization: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(authorization ?? "");
  if (!m) return null;
  const llave = m[1];
  return llave.startsWith(PREFIJO_LLAVE) && llave.length >= PREFIJO_LLAVE.length + 40 && llave.length <= 100 ? llave : null;
}
