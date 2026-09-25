import "server-only";

import { connection } from "next/server";

import { rangoDePeriodo, type Rango } from "@/lib/dashboard/periodos";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";

/** Días hacia adelante que cubre la lista de pólizas por vencer. */
export const DIAS_POR_VENCER_REPORTE = 30;
export const LIMITE_POR_VENCER = 50;

/** Prima y número de pólizas cuya vigencia inicia en el rango (misma definición que el dashboard). */
async function emision({ desde, hasta }: Rango) {
  const r = await db.poliza.aggregate({
    where: { vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
    _count: { _all: true },
  });
  return { prima: Number(r._sum.prima_total ?? 0), polizas: r._count._all };
}

export async function getReportes() {
  await connection();
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const limite = new Date(hoy.getTime() + DIAS_POR_VENCER_REPORTE * 86_400_000);
  const vigentes = { vigencia_inicio: { lte: hoy }, vigencia_fin: { gte: hoy } };

  const [mes, anio, porRamo, porVencer, resumenPorVencer] = await Promise.all([
    emision(rangoDePeriodo("mes", hoyIso).actual),
    emision(rangoDePeriodo("anio", hoyIso).actual),
    db.poliza.groupBy({
      by: ["ramo"],
      where: vigentes,
      _count: { _all: true },
      _sum: { prima_total: true },
    }),
    db.poliza.findMany({
      where: { vigencia_fin: { gte: hoy, lte: limite } },
      orderBy: { vigencia_fin: "asc" },
      take: LIMITE_POR_VENCER,
      select: {
        id: true,
        numeroImpreso: true,
        ramo: true,
        vigencia_fin: true,
        prima_total: true,
        cliente: { select: { nombre: true, telefono: true } },
        aseguradora: { select: { nombre: true, color_hex: true } },
      },
    }),
    db.poliza.aggregate({
      where: { vigencia_fin: { gte: hoy, lte: limite } },
      _count: { _all: true },
      _sum: { prima_total: true },
    }),
  ]);

  const distribucion = porRamo
    .map((g) => ({ ramo: g.ramo, polizas: g._count._all, prima: Number(g._sum.prima_total ?? 0) }))
    .sort((a, b) => b.polizas - a.polizas || b.prima - a.prima);

  return {
    hoy: hoyIso,
    mes,
    anio,
    distribucion,
    porVencer: porVencer.map((p) => ({ ...p, prima_total: Number(p.prima_total) })),
    totalPorVencer: resumenPorVencer._count._all,
    primaPorVencer: Number(resumenPorVencer._sum.prima_total ?? 0),
  };
}
