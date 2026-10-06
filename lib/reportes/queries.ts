import "server-only";

import { connection } from "next/server";

import { type Rango } from "@/lib/dashboard/periodos";
import { getAlcance, polizasDe, type Alcance } from "@/lib/auth/alcance";
import { produccionPorEjecutivo } from "@/lib/dashboard/queries";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";
import { NO_CANCELADA } from "@/lib/polizas/queries";
import { rangoReporte, type PeriodoReporte } from "@/lib/reportes/periodos";

/** Días hacia adelante que cubre la lista de pólizas por vencer. */
export const DIAS_POR_VENCER_REPORTE = 30;
export const LIMITE_POR_VENCER = 50;

/**
 * Pólizas visibles emitidas en el rango: las que inician vigencia en él (misma definición que el
 * dashboard). Sin rango ("Histórico") son todas.
 */
function whereEmision(alcance: Alcance, rango: Rango | null): Prisma.PolizaWhereInput {
  return rango
    ? { ...polizasDe(alcance), vigencia_inicio: { gte: rango.desde, lte: rango.hasta } }
    : polizasDe(alcance);
}

export async function getReportes(periodo: PeriodoReporte) {
  await connection();
  const alcance = await getAlcance();
  const { agenciaId } = alcance;
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const limite = new Date(hoy.getTime() + DIAS_POR_VENCER_REPORTE * 86_400_000);
  const rango = rangoReporte(periodo, hoyIso);
  const emitidas = whereEmision(alcance, rango);
  const porVencerWhere: Prisma.PolizaWhereInput = { ...polizasDe(alcance), ...NO_CANCELADA, vigencia_fin: { gte: hoy, lte: limite } };

  const [emision, porRamo, porAseguradora, aseguradoras, porVencer, resumenPorVencer, porEjecutivo] = await Promise.all([
    db.poliza.aggregate({
      where: emitidas,
      _sum: { prima_total: true },
      _count: { _all: true },
      _min: { vigencia_inicio: true },
    }),
    db.poliza.groupBy({
      by: ["ramo"],
      where: emitidas,
      _count: { _all: true },
      _sum: { prima_total: true },
    }),
    db.poliza.groupBy({
      by: ["aseguradora_id"],
      where: emitidas,
      _count: { _all: true },
      _sum: { prima_total: true },
    }),
    db.aseguradora.findMany({ where: { agenciaId }, select: { id: true, nombre: true, color_hex: true } }),
    db.poliza.findMany({
      where: porVencerWhere,
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
        ejecutivo: { select: { nombre: true } },
      },
    }),
    db.poliza.aggregate({
      where: porVencerWhere,
      _count: { _all: true },
      _sum: { prima_total: true },
    }),
    // De toda la agencia: no la ve un ejecutivo que solo ve su cartera.
    alcance.ejecutivoId ? Promise.resolve(null) : produccionPorEjecutivo(agenciaId, rango ?? { desde: new Date(0), hasta: hoy }),
  ]);

  const distribucion = porRamo
    .map((g) => ({ ramo: g.ramo, polizas: g._count._all, prima: Number(g._sum.prima_total ?? 0) }))
    .sort((a, b) => b.prima - a.prima || b.polizas - a.polizas);

  const aseguradoraPorId = new Map(aseguradoras.map((a) => [a.id, a]));
  const distribucionAseguradora = porAseguradora
    .map((g) => {
      const a = aseguradoraPorId.get(g.aseguradora_id);
      return {
        id: g.aseguradora_id,
        nombre: a?.nombre ?? "Sin aseguradora",
        color: a?.color_hex ?? "",
        polizas: g._count._all,
        prima: Number(g._sum.prima_total ?? 0),
      };
    })
    .sort((a, b) => b.prima - a.prima || b.polizas - a.polizas);

  return {
    hoy: hoyIso,
    // En "Histórico" el periodo arranca en la primera póliza emitida.
    rango: rango ?? (emision._min.vigencia_inicio ? { desde: emision._min.vigencia_inicio, hasta: hoy } : null),
    emision: { prima: Number(emision._sum.prima_total ?? 0), polizas: emision._count._all },
    distribucion,
    distribucionAseguradora,
    porEjecutivo,
    porVencer: porVencer.map((p) => ({ ...p, prima_total: Number(p.prima_total) })),
    totalPorVencer: resumenPorVencer._count._all,
    primaPorVencer: Number(resumenPorVencer._sum.prima_total ?? 0),
  };
}

/** Pólizas visibles que componen los números del reporte, para exportarlas a CSV. */
export async function getPolizasReporte(alcance: Alcance, periodo: PeriodoReporte) {
  await connection();
  const polizas = await db.poliza.findMany({
    where: whereEmision(alcance, rangoReporte(periodo, hoyISO())),
    orderBy: [{ vigencia_inicio: "asc" }, { numeroImpreso: "asc" }],
    select: {
      numeroImpreso: true,
      polizaVigor: true,
      ramo: true,
      forma_pago: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_neta: true,
      prima_total: true,
      canceladaAt: true,
      cliente: { select: { nombre: true } },
      aseguradora: { select: { nombre: true } },
      ejecutivo: { select: { nombre: true } },
    },
  });
  return polizas.map((p) => ({
    ...p,
    prima_neta: p.prima_neta === null ? null : Number(p.prima_neta),
    prima_total: Number(p.prima_total),
  }));
}
