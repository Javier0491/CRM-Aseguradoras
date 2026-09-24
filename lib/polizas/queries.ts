import "server-only";

import { connection } from "next/server";

import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import type { Prisma, Ramo } from "@/lib/generated/prisma/client";
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

/** Días antes del fin de vigencia en que una póliza se considera "por vencer". */
export const DIAS_POR_VENCER = 30;

export type FiltrosPolizas = {
  /** Texto libre: número de póliza, póliza vigor, cliente, RFC o asegurado. */
  q?: string;
  ramo?: Ramo;
};

export async function getPolizasListado(filtros: FiltrosPolizas = {}) {
  await connection();
  const q = filtros.q?.trim().slice(0, 100);
  const contiene = (valor: string) => ({ contains: valor, mode: "insensitive" as const });

  const where: Prisma.PolizaWhereInput = {
    ...(filtros.ramo && { ramo: filtros.ramo }),
    ...(q && {
      OR: [
        { numeroImpreso: contiene(q) },
        { polizaVigor: contiene(q) },
        { cliente: { nombre: contiene(q) } },
        { cliente: { rfc: contiene(q) } },
        { asegurados: { some: { nombre: contiene(q) } } },
      ],
    }),
  };

  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const limite = new Date(hoy.getTime() + DIAS_POR_VENCER * 86_400_000);

  const [polizas, total, totalGeneral, porVencer] = await Promise.all([
    db.poliza.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: LIMITE_LISTADO,
      select: {
        id: true,
        numeroImpreso: true,
        polizaVigor: true,
        caratula_path: true,
        negociacion_path: true,
        expediente_path: true,
        ramo: true,
        vigencia_inicio: true,
        vigencia_fin: true,
        prima_total: true,
        forma_pago: true,
        created_at: true,
        cliente: { select: { nombre: true, rfc: true } },
        aseguradora: { select: { nombre: true, color_hex: true } },
        recibos: { select: { estado: true } },
        // Para el resumen de asegurados: el titular y cuántos son en total.
        asegurados: { where: { parentesco: "Titular" }, select: { nombre: true }, take: 1 },
        _count: { select: { asegurados: true } },
      },
    }),
    db.poliza.count({ where }),
    db.poliza.count(),
    db.poliza.count({ where: { vigencia_fin: { gte: hoy, lte: limite } } }),
  ]);
  return { polizas, total, totalGeneral, porVencer };
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
            id: true,
            numeroImpreso: true,
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

export async function getPolizaDetalle(id: string) {
  await connection();
  return db.poliza.findUnique({
    where: { id },
    select: {
      id: true,
      numeroImpreso: true,
      polizaVigor: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_total: true,
      forma_pago: true,
      created_at: true,
      comision_personalizada_pct: true,
      datos_ramo: true,
      caratula_path: true,
      caratula_nombre: true,
      caratula_bytes: true,
      caratula_subido_at: true,
      negociacion_path: true,
      negociacion_nombre: true,
      negociacion_bytes: true,
      negociacion_subido_at: true,
      expediente_path: true,
      expediente_nombre: true,
      expediente_bytes: true,
      expediente_subido_at: true,
      cliente: { select: { nombre: true, rfc: true, telefono: true, email: true } },
      aseguradora: { select: { nombre: true, color_hex: true } },
      asegurados: {
        orderBy: { orden: "asc" },
        select: {
          id: true,
          nombre: true,
          parentesco: true,
          edad: true,
          sexo: true,
          fecha_nacimiento: true,
          antiguedad: true,
        },
      },
      recibos: {
        orderBy: { numero: "asc" },
        select: { id: true, numero: true, monto: true, fecha_vencimiento: true, estado: true },
      },
    },
  });
}
