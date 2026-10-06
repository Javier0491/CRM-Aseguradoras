import "server-only";

import { requireUser, type UsuarioSesion } from "@/lib/auth/dal";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Qué datos ve la sesión: los de su agencia y, si es un EJECUTIVO de una agencia con "cartera por
 * ejecutivo", solo los clientes y pólizas que tiene asignados (`ejecutivoId`).
 */
export type Alcance = { agenciaId: string; ejecutivoId: string | null };

export const alcanceDe = (user: Pick<UsuarioSesion, "id" | "agenciaId" | "soloSuCartera">): Alcance => ({
  agenciaId: user.agenciaId,
  ejecutivoId: user.soloSuCartera ? user.id : null,
});

/** Alcance de la sesión; sin sesión redirige a /login (en páginas). */
export async function getAlcance(): Promise<Alcance> {
  return alcanceDe(await requireUser());
}

/** Pólizas visibles. No trae OR: se puede combinar con otros filtros con spread. */
export const polizasDe = (a: Alcance): Prisma.PolizaWhereInput => ({
  agenciaId: a.agenciaId,
  ...(a.ejecutivoId && { ejecutivoId: a.ejecutivoId }),
});

/**
 * Clientes visibles: los asignados al ejecutivo o con alguna póliza suya. Trae OR: combínalo con
 * otros filtros dentro de un AND para no reemplazarlo.
 */
export const clientesDe = (a: Alcance): Prisma.ClienteWhereInput => ({
  agenciaId: a.agenciaId,
  ...(a.ejecutivoId && {
    OR: [{ ejecutivoId: a.ejecutivoId }, { polizas: { some: { ejecutivoId: a.ejecutivoId } } }],
  }),
});

/** Recibos de las pólizas visibles. Trae `poliza`: combínalo dentro de un AND si filtras por póliza. */
export const recibosDe = (a: Alcance): Prisma.ReciboWhereInput => ({
  agenciaId: a.agenciaId,
  ...(a.ejecutivoId && { poliza: { ejecutivoId: a.ejecutivoId } }),
});
