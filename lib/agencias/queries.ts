import "server-only";

import { cache } from "react";

import { logoParaDocumentos } from "@/lib/agencias/marca";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** Datos de la agencia (nombre y marca). Memoizado por render: lo usan el layout y las páginas. */
export const getAgencia = cache(async (agenciaId: string) => {
  return db.agencia.findUniqueOrThrow({
    where: { id: agenciaId },
    select: { id: true, nombre: true, logoUrl: true, colorHex: true, tema: true, suspendida: true },
  });
});

/** Marca de la agencia para sus correos: nombre, color, tema y el logo para documentos. */
export async function getMarcaCorreo(agenciaId: string) {
  const a = await db.agencia.findUniqueOrThrow({
    where: { id: agenciaId },
    select: { nombre: true, colorHex: true, tema: true, logoUrl: true, logoDocumentosUrl: true, correoServicio: true },
  });
  return {
    nombre: a.nombre,
    colorHex: a.colorHex,
    tema: a.tema,
    logoUrl: logoParaDocumentos(a),
    correoServicio: a.correoServicio,
  };
}

/**
 * Todas las agencias con su marca y su tamaño, para el panel del SUPERADMIN. Es la única consulta
 * que cruza agencias: exige el rol aquí mismo (no confía en quien la llame).
 */
export async function getAgenciasParaSuperadmin() {
  const user = await getCurrentUser();
  if (!user?.superadmin) return [];
  return db.agencia.findMany({
    orderBy: [{ createdAt: "asc" }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      logoUrl: true,
      colorHex: true,
      tema: true,
      slug: true,
      suspendida: true,
      suspendidaAt: true,
      motivoSuspension: true,
      createdAt: true,
      _count: { select: { usuarios: true, clientes: true, polizas: true } },
    },
  });
}
export type AgenciaLobby = Awaited<ReturnType<typeof getAgenciasParaSuperadmin>>[number];
