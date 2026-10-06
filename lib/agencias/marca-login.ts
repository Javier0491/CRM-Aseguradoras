import "server-only";

import { cookies } from "next/headers";

import { esTema, TEMA_PREDETERMINADO, type Tema } from "@/lib/agencias/marca";
import { slugValido } from "@/lib/agencias/slug";
import { db } from "@/lib/db";

/** Cookie con el slug de la última agencia que inició sesión en este navegador. */
export const COOKIE_AGENCIA = "crm_agencia";
const UN_ANIO_S = 365 * 24 * 60 * 60;

export type MarcaLogin = { slug: string; nombre: string; logoUrl: string | null; colorHex: string | null; tema: Tema };

/**
 * Marca del inicio de sesión: la de `?agencia=<slug>` o, sin ella, la de la última agencia que
 * entró en este navegador. null = la marca neutra de la plataforma.
 */
export async function getMarcaLogin(slugParam?: string): Promise<MarcaLogin | null> {
  const slug = slugValido(slugParam) ? slugParam : (await cookies()).get(COOKIE_AGENCIA)?.value;
  if (!slugValido(slug)) return null;
  const agencia = await db.agencia.findUnique({
    where: { slug },
    select: { slug: true, nombre: true, logoUrl: true, colorHex: true, tema: true },
  });
  if (!agencia) return null;
  return { ...agencia, tema: esTema(agencia.tema) ? agencia.tema : TEMA_PREDETERMINADO };
}

/** Recuerda la agencia en este navegador para que su próximo inicio de sesión lleve su marca. */
export async function recordarAgencia(agenciaId: string) {
  const agencia = await db.agencia.findUnique({ where: { id: agenciaId }, select: { slug: true } });
  if (!agencia) return;
  (await cookies()).set(COOKIE_AGENCIA, agencia.slug, {
    path: "/",
    maxAge: UN_ANIO_S,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
