import "server-only";

import { requireUsuarioCrm, type UsuarioSesion } from "@/lib/auth/dal";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Qué datos ve la sesión: los de su agencia y, si es un EJECUTIVO de una agencia con "cartera por
 * ejecutivo", solo los clientes y pólizas que tiene asignados (`ejecutivoId`). Quien solo usa
 * Tareas (`ninguno`) no ve ninguna póliza, cliente ni recibo.
 */
export type Alcance = { agenciaId: string; ejecutivoId: string | null; ninguno?: boolean };

export const alcanceDe = (
  user: Pick<UsuarioSesion, "id" | "agenciaId" | "soloSuCartera"> & Partial<Pick<UsuarioSesion, "soloTareas">>
): Alcance => ({
  agenciaId: user.agenciaId,
  ejecutivoId: user.soloSuCartera ? user.id : null,
  ...(user.soloTareas && { ninguno: true }),
});

/** Alcance de la sesión; sin sesión redirige a /login y a quien solo usa Tareas, a /tareas (en páginas). */
export async function getAlcance(): Promise<Alcance> {
  return alcanceDe(await requireUsuarioCrm());
}

/** Ningún registro: el filtro de quien solo usa Tareas. */
const NINGUNO = { id: { in: [] as string[] } };

/** Pólizas visibles. No trae OR: se puede combinar con otros filtros con spread. */
export const polizasDe = (a: Alcance): Prisma.PolizaWhereInput => ({
  agenciaId: a.agenciaId,
  ...(a.ejecutivoId && { ejecutivoId: a.ejecutivoId }),
  ...(a.ninguno && NINGUNO),
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
  ...(a.ninguno && NINGUNO),
});

/** Recibos de las pólizas visibles. Trae `poliza`: combínalo dentro de un AND si filtras por póliza. */
export const recibosDe = (a: Alcance): Prisma.ReciboWhereInput => ({
  agenciaId: a.agenciaId,
  ...(a.ejecutivoId && { poliza: { ejecutivoId: a.ejecutivoId } }),
  ...(a.ninguno && NINGUNO),
});
