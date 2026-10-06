import "server-only";

/** Monograma de la plataforma (Atelier Zenith) para la interfaz: ficha oscura de 256 px. */
export const LOGO_PLATAFORMA = "/marca/plataforma.png";

/**
 * Nombre de la plataforma (por encima de las agencias): PLATAFORMA_NOMBRE o, si no, el nombre
 * visible de EMAIL_SENDER ("Magnus Seguros <servicio@…>" → "Magnus Seguros"); sin ninguno,
 * "Atelier Zenith". Se usa en el inicio de sesión sin marca y en los correos de la plataforma a
 * las agencias.
 */
export function nombrePlataforma(): string {
  const explicito = process.env.PLATAFORMA_NOMBRE?.trim();
  if (explicito) return explicito.slice(0, 60);
  const remitente = process.env.EMAIL_SENDER?.trim() ?? "";
  const visible = /^\s*"?([^"<]+?)"?\s*</.exec(remitente)?.[1]?.trim();
  return visible || "Atelier Zenith";
}

/**
 * Logo de la plataforma con dirección completa, para los correos (los clientes de correo no
 * resuelven rutas relativas). En Vercel sale del dominio de producción; en local, null (el
 * correo muestra el nombre en su lugar).
 */
export function logoPlataformaUrl(): string | null {
  const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return dominio ? `https://${dominio}${LOGO_PLATAFORMA}` : null;
}
