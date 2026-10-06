// Slug de la agencia: identifica su liga de acceso con marca (/login?agencia=<slug>). Mismas
// reglas que el CHECK de la base de datos (migración 20261005160000_login_con_marca).

export const SLUG_MIN = 2;
export const SLUG_MAX = 60;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const slugValido = (s: unknown): s is string =>
  typeof s === "string" && s.length >= SLUG_MIN && s.length <= SLUG_MAX && SLUG.test(s);

/** "Seguros Ruiz & Asociados" → "seguros-ruiz-asociados" (sin acentos, máximo 40 caracteres). */
export function slugDesdeNombre(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= SLUG_MIN ? base : `agencia${base ? `-${base}` : ""}`;
}

/** Normaliza lo que escribe el usuario para su liga ("Mi Agencia" → "mi-agencia"). */
export const normalizarSlug = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
