import "server-only";

import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";
import { definicionPlan, hayCupo, mensajeLimiteOcr, mensajeLimiteUsuarios, periodoDe } from "@/lib/planes/planes";

/** La operación rebasaría el plan de la agencia; el mensaje se le muestra tal cual al usuario. */
export class LimitePlanError extends Error {}

type Cliente = Prisma.TransactionClient | typeof db;

const fechaDb = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Cuentas que ocupan lugar en el plan: las activas de la agencia, sin los SUPERADMIN (son de la plataforma). */
export const USUARIOS_DEL_PLAN = { activo: true, rolSistema: "USER" } as const;

/**
 * Por qué no cabe otra cuenta activa en la agencia, o null si cabe. Dentro de una transacción
 * Serializable el conteo protege también contra dos altas simultáneas por el último lugar.
 */
export async function faltaCupoUsuarios(cliente: Cliente, agenciaId: string): Promise<string | null> {
  const agencia = await cliente.agencia.findUnique({ where: { id: agenciaId }, select: { plan: true, edicion: true } });
  if (!agencia) return "La agencia ya no existe; recarga la página.";
  const limite = definicionPlan(agencia.plan, agencia.edicion).usuarios;
  if (limite === null) return null;
  const activos = await cliente.usuario.count({ where: { agenciaId, ...USUARIOS_DEL_PLAN } });
  return hayCupo(activos, limite) ? null : mensajeLimiteUsuarios(agencia.plan, agencia.edicion);
}

export type ReservaOcr = { ok: true; periodo: string } | { ok: false; error: string };

/**
 * Aparta un escaneo con IA del mes para la agencia antes de llamar a la IA. Es un solo INSERT …
 * ON CONFLICT con la condición del límite: dos lecturas simultáneas no pueden pasar ambas con el
 * último escaneo. Si la lectura falla, liberarEscaneoOcr lo devuelve.
 */
export async function reservarEscaneoOcr(agenciaId: string): Promise<ReservaOcr> {
  const agencia = await db.agencia.findUnique({ where: { id: agenciaId }, select: { plan: true, edicion: true } });
  if (!agencia) return { ok: false, error: "La agencia ya no existe." };
  const limite = definicionPlan(agencia.plan, agencia.edicion).ocrMensual;
  // Edición Básico: sin captura con IA (no se aparta nada).
  if (limite === 0) return { ok: false, error: mensajeLimiteOcr(agencia.plan, agencia.edicion) };
  const periodo = periodoDe(hoyISO());
  const filas = await db.$queryRaw<{ escaneos: number }[]>`
    INSERT INTO uso_ocr (agencia_id, periodo, escaneos)
    VALUES (${agenciaId}::uuid, ${periodo}::date, 1)
    ON CONFLICT (agencia_id, periodo) DO UPDATE SET escaneos = uso_ocr.escaneos + 1
    WHERE ${limite}::int IS NULL OR uso_ocr.escaneos < ${limite}::int
    RETURNING escaneos`;
  return filas.length > 0 ? { ok: true, periodo } : { ok: false, error: mensajeLimiteOcr(agencia.plan, agencia.edicion) };
}

/** Devuelve un escaneo apartado cuya lectura falló: no se descuenta lo que no se entregó. */
export async function liberarEscaneoOcr(agenciaId: string, periodo: string) {
  await db.usoOcr.updateMany({
    where: { agenciaId, periodo: fechaDb(periodo), escaneos: { gt: 0 } },
    data: { escaneos: { decrement: 1 } },
  });
}

/** Plan de la agencia y lo que lleva usado: cuentas activas y escaneos con IA de este mes. */
export async function getUsoPlan(agenciaId: string) {
  const periodo = fechaDb(periodoDe(hoyISO()));
  const [agencia, usuarios, ocr] = await Promise.all([
    db.agencia.findUniqueOrThrow({ where: { id: agenciaId }, select: { plan: true, edicion: true, cicloFacturacion: true } }),
    db.usuario.count({ where: { agenciaId, ...USUARIOS_DEL_PLAN } }),
    db.usoOcr.findUnique({ where: { agenciaId_periodo: { agenciaId, periodo } }, select: { escaneos: true } }),
  ]);
  const definicion = definicionPlan(agencia.plan, agencia.edicion);
  return {
    plan: agencia.plan,
    edicion: agencia.edicion,
    ciclo: agencia.cicloFacturacion,
    nombre: definicion.nombre,
    usuarios: { usados: usuarios, limite: definicion.usuarios },
    ocr: { usados: ocr?.escaneos ?? 0, limite: definicion.ocrMensual },
  };
}
export type UsoPlan = Awaited<ReturnType<typeof getUsoPlan>>;
