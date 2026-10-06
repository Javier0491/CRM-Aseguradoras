import "server-only";

/**
 * Nombre de la plataforma (por encima de las agencias): PLATAFORMA_NOMBRE o, si no, el nombre
 * visible de EMAIL_SENDER ("Magnus Seguros <servicio@…>" → "Magnus Seguros"). Se usa en el inicio
 * de sesión sin marca y en los correos de la plataforma a las agencias.
 */
export function nombrePlataforma(): string {
  const explicito = process.env.PLATAFORMA_NOMBRE?.trim();
  if (explicito) return explicito.slice(0, 60);
  const remitente = process.env.EMAIL_SENDER?.trim() ?? "";
  const visible = /^\s*"?([^"<]+?)"?\s*</.exec(remitente)?.[1]?.trim();
  return visible || "CRM de Seguros";
}
