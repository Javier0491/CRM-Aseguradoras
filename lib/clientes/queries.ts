import "server-only";

import { connection } from "next/server";

import { clientesDe, getAlcance } from "@/lib/auth/alcance";
import { requireUser } from "@/lib/auth/dal";
import { posiblesDuplicados, RFC_GENERICOS } from "@/lib/clientes/reglas";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { normalizarRfc } from "@/lib/polizas/validacion";

export const LIMITE_CLIENTES = 200;

/**
 * Directorio de clientes visibles con su número de pólizas; `q` busca en nombre, RFC, teléfono y
 * correo; `ejecutivo` filtra por responsable (id o "sin").
 */
export async function getClientesListado(q = "", ejecutivo?: string) {
  await connection();
  const alcance = await getAlcance();
  const texto = q.trim().slice(0, 100);
  const contiene = { contains: texto, mode: "insensitive" as const };
  const visibles = clientesDe(alcance);
  const where: Prisma.ClienteWhereInput = {
    AND: [
      visibles,
      texto ? { OR: [{ nombre: contiene }, { rfc: contiene }, { telefono: contiene }, { email: contiene }] } : {},
      ejecutivo ? { ejecutivoId: ejecutivo === "sin" ? null : ejecutivo.slice(0, 64) } : {},
    ],
  };

  const [clientes, total, totalGeneral] = await Promise.all([
    db.cliente.findMany({
      where,
      orderBy: { nombre: "asc" },
      take: LIMITE_CLIENTES,
      select: {
        id: true,
        nombre: true,
        rfc: true,
        telefono: true,
        email: true,
        tipoPersona: true,
        ejecutivo: { select: { nombre: true } },
        _count: { select: { polizas: true } },
      },
    }),
    db.cliente.count({ where }),
    db.cliente.count({ where: visibles }),
  ]);
  return { clientes, total, totalGeneral };
}

/** Expediente del cliente: datos, pólizas (las más recientes primero) y seguimiento. */
export async function getClienteExpediente(id: string) {
  await connection();
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  const alcance = await getAlcance();
  return db.cliente.findFirst({
    where: { AND: [{ id }, clientesDe(alcance)] },
    select: {
      id: true,
      nombre: true,
      rfc: true,
      telefono: true,
      email: true,
      tipoPersona: true,
      fechaNacimiento: true,
      direccion: true,
      municipio: true,
      estado: true,
      codigoPostal: true,
      ejecutivoId: true,
      ejecutivo: { select: { id: true, nombre: true } },
      polizas: {
        orderBy: [{ vigencia_fin: "desc" }, { numeroImpreso: "asc" }],
        select: {
          id: true,
          numeroImpreso: true,
          polizaVigor: true,
          ramo: true,
          vigencia_inicio: true,
          vigencia_fin: true,
          prima_total: true,
          forma_pago: true,
          canceladaAt: true,
          aseguradora: { select: { nombre: true, color_hex: true } },
          recibos: { select: { estado: true } },
        },
      },
      notas: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          tipo: true,
          texto: true,
          createdAt: true,
          usuarioId: true,
          usuarioEmail: true,
          poliza: { select: { id: true, numeroImpreso: true } },
        },
      },
    },
  });
}

/**
 * Otros clientes de la agencia que pueden ser la misma persona (ver posiblesDuplicados), para
 * fusionarlos. Solo para administradores: la fusión mueve pólizas de una cartera a otra.
 */
export async function getPosiblesDuplicados(cliente: { id: string; nombre: string; rfc: string }) {
  const user = await requireUser();
  const rfc = normalizarRfc(cliente.rfc);
  const prefijo = rfc.length >= 12 && !RFC_GENERICOS.has(rfc) ? rfc.slice(0, rfc.length - 3) : null;
  const palabra = cliente.nombre.trim().split(/\s+/)[0] ?? "";
  const candidatos = await db.cliente.findMany({
    where: {
      agenciaId: user.agenciaId,
      id: { not: cliente.id },
      OR: [
        ...(prefijo ? [{ rfc: { startsWith: prefijo } }] : []),
        ...(palabra.length >= 2 ? [{ nombre: { startsWith: palabra, mode: "insensitive" as const } }] : []),
      ],
    },
    take: 200,
    select: { id: true, nombre: true, rfc: true, telefono: true, email: true, _count: { select: { polizas: true } } },
  });
  return candidatos.filter((c) => posiblesDuplicados(cliente, c)).slice(0, 10);
}
