import "server-only";

import type { UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type ResultadoAsignacion = { ok: true; ejecutivoId: string | null } | { ok: false; error: string };

const ID_USUARIO = /^[\w-]{1,64}$/;

/**
 * Campo "ejecutivoId" de un payload: el id elegido, null ("Sin asignar") o undefined si no viene.
 * Un valor de otro tipo cuenta como inválido (cadena vacía no: es "Sin asignar").
 */
export function leerEjecutivoSolicitado(raw: unknown): string | null | undefined {
  if (typeof raw !== "object" || raw === null || !("ejecutivoId" in raw)) return undefined;
  const valor = (raw as { ejecutivoId: unknown }).ejecutivoId;
  if (valor === null || valor === "") return null;
  return typeof valor === "string" ? valor : "\u0000";
}

/**
 * Ejecutivo responsable de un cliente, póliza o tarea: una cuenta activa (no SUPERADMIN) de la
 * agencia, o nadie. Un ejecutivo que solo ve su cartera siempre queda como responsable (así no
 * pierde de vista lo que captura). Sin valor solicitado se conserva `actual`; en un registro nuevo
 * (`actual` undefined) se asigna a quien lo captura si es del equipo de la agencia.
 */
export async function resolverEjecutivo(
  usuario: UsuarioSesion,
  solicitado: string | null | undefined,
  actual?: string | null
): Promise<ResultadoAsignacion> {
  if (usuario.soloSuCartera) return { ok: true, ejecutivoId: usuario.id };
  if (solicitado === undefined) {
    if (actual !== undefined) return { ok: true, ejecutivoId: actual };
    const delEquipo = !usuario.superadmin && usuario.agenciaPropiaId === usuario.agenciaId;
    return { ok: true, ejecutivoId: delEquipo ? usuario.id : null };
  }
  if (solicitado === null) return { ok: true, ejecutivoId: null };
  // El responsable que ya tenía se conserva aunque su cuenta se haya desactivado.
  if (solicitado === actual) return { ok: true, ejecutivoId: actual };
  if (!ID_USUARIO.test(solicitado)) return { ok: false, error: "Ejecutivo inválido." };
  const cuenta = await db.usuario.findFirst({
    where: { id: solicitado, agenciaId: usuario.agenciaId, activo: true, rolSistema: "USER" },
    select: { id: true },
  });
  return cuenta
    ? { ok: true, ejecutivoId: cuenta.id }
    : { ok: false, error: "El ejecutivo elegido ya no está activo en la agencia; elige otro." };
}
