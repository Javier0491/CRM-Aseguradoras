import "server-only";

import { connection } from "next/server";

import { db } from "@/lib/db";
import type { Opcion } from "@/lib/polizas/ramos";

export const LIMITE_LISTADO = 200;

export async function getAseguradorasOpciones(): Promise<Opcion[]> {
  await connection();
  const rows = await db.aseguradora.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  return rows.map((a) => ({ value: a.id, label: a.nombre }));
}

export async function getPolizasListado() {
  await connection();
  const [polizas, total] = await Promise.all([
    db.poliza.findMany({
      orderBy: { created_at: "desc" },
      take: LIMITE_LISTADO,
      select: {
        id: true,
        numero_poliza_original: true,
        numero_poliza_vigor: true,
        ramo: true,
        vigencia_inicio: true,
        vigencia_fin: true,
        prima_total: true,
        forma_pago: true,
        created_at: true,
        cliente: { select: { nombre: true, rfc: true } },
        aseguradora: { select: { nombre: true, color_hex: true } },
        recibos: { select: { estado: true } },
      },
    }),
    db.poliza.count(),
  ]);
  return { polizas, total };
}

export async function getRecibosListado() {
  await connection();
  const [recibos, total, pendientes] = await Promise.all([
    db.recibo.findMany({
      orderBy: [{ fecha_vencimiento: "asc" }, { numero: "asc" }],
      take: LIMITE_LISTADO,
      select: {
        id: true,
        numero: true,
        monto: true,
        fecha_vencimiento: true,
        estado: true,
        poliza: {
          select: {
            numero_poliza_original: true,
            _count: { select: { recibos: true } },
            cliente: { select: { nombre: true } },
            aseguradora: { select: { nombre: true, color_hex: true } },
          },
        },
      },
    }),
    db.recibo.count(),
    db.recibo.aggregate({
      where: { estado: "PENDIENTE" },
      _count: true,
      _sum: { monto: true },
    }),
  ]);
  return {
    recibos,
    total,
    pendientes: { cantidad: pendientes._count, monto: Number(pendientes._sum.monto ?? 0) },
  };
}
