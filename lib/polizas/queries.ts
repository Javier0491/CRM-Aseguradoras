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
        numeroImpreso: true,
        polizaVigor: true,
        caratula_path: true,
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
      caratula_path: true,
      caratula_nombre: true,
      caratula_bytes: true,
      caratula_subido_at: true,
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
