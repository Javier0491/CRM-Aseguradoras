import "server-only";

import { connection } from "next/server";

import {
  anioParaComision,
  comisionEsperada,
  edadDelTitular,
  primaNetaDelRecibo,
  resolverPorcentaje,
} from "@/lib/conciliacion/comisiones";
import { rangoDePeriodo, type Periodo, type Rango } from "@/lib/dashboard/periodos";
import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";

/** Días hacia adelante que cubre la lista de próximos vencimientos. */
export const DIAS_PROXIMOS_VENCIMIENTOS = 30;
const LIMITE_RECIBOS = 10;
const LIMITE_VENCIMIENTOS = 8;

const variacion = (actual: number, anterior: number) =>
  anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;

/** Primas de las pólizas cuya vigencia inicia en el rango (la emisión de la póliza). */
async function primasEmitidas(agenciaId: string, { desde, hasta }: Rango) {
  const r = await db.poliza.aggregate({
    where: { agenciaId, vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
  });
  return Number(r._sum.prima_total ?? 0);
}

/** Pólizas cuya vigencia se traslapa con el rango. */
function polizasActivas(agenciaId: string, { desde, hasta }: Rango) {
  return db.poliza.count({ where: { agenciaId, vigencia_inicio: { lte: hasta }, vigencia_fin: { gte: desde } } });
}

/**
 * De las pólizas que vencieron en el rango, cuántas se renovaron: existe otra póliza con la
 * misma póliza vigor y aseguradora que inicia después. null si ninguna venció.
 */
async function tasaRenovacion(agenciaId: string, { desde, hasta }: Rango, hoy: Date) {
  const tope = hasta < hoy ? hasta : hoy;
  const vencidas = await db.poliza.findMany({
    where: { agenciaId, vigencia_fin: { gte: desde, lte: tope } },
    select: { polizaVigor: true, aseguradora_id: true, vigencia_inicio: true },
  });
  if (vencidas.length === 0) return { tasa: null, vencidas: 0, renovadas: 0 };

  const vigores = [...new Set(vencidas.map((p) => p.polizaVigor).filter((v): v is string => Boolean(v)))];
  const candidatas = vigores.length
    ? await db.poliza.findMany({
        where: { agenciaId, polizaVigor: { in: vigores } },
        select: { polizaVigor: true, aseguradora_id: true, vigencia_inicio: true },
      })
    : [];
  const renovadas = vencidas.filter((v) =>
    candidatas.some(
      (c) =>
        c.polizaVigor === v.polizaVigor &&
        c.aseguradora_id === v.aseguradora_id &&
        c.vigencia_inicio > v.vigencia_inicio
    )
  ).length;
  return { tasa: (renovadas / vencidas.length) * 100, vencidas: vencidas.length, renovadas };
}

/**
 * Comisión esperada de los recibos PENDIENTES que vencen en el rango, con la misma regla que
 * la conciliación: (prima neta ÷ número de recibos) × % personalizado de la póliza o de la
 * matriz por aseguradora, ramo y año de la póliza (por la antigüedad del titular o, sin ella,
 * desde la primera vigencia de su cadena). Los recibos sin % aplicable o sin prima neta no suman y se reportan aparte.
 */
async function comisionesPendientes(agenciaId: string, { desde, hasta }: Rango) {
  const recibos = await db.recibo.findMany({
    where: { agenciaId, estado: "PENDIENTE", fecha_vencimiento: { gte: desde, lte: hasta } },
    select: {
      numero: true,
      fecha_vencimiento: true,
      poliza: {
        select: {
          id: true,
          polizaVigor: true,
          aseguradora_id: true,
          ramo: true,
          vigencia_inicio: true,
          vigencia_fin: true,
          forma_pago: true,
          prima_neta: true,
          comision_personalizada_pct: true,
          asegurados: {
            select: { parentesco: true, orden: true, edad: true, fecha_nacimiento: true, antiguedad: true },
          },
        },
      },
    },
  });
  if (recibos.length === 0) return { valor: 0, recibos: 0, sinPorcentaje: 0, sinPrimaNeta: 0 };

  const aseguradoras = [...new Set(recibos.map((r) => r.poliza.aseguradora_id))];
  const vigores = [...new Set(recibos.map((r) => r.poliza.polizaVigor).filter((v): v is string => Boolean(v)))];
  const [esquemas, cadenas] = await Promise.all([
    db.esquemaComision.findMany({
      where: { agenciaId, aseguradora_id: { in: aseguradoras } },
      select: {
        aseguradora_id: true,
        ramo: true,
        anio_poliza: true,
        porcentaje: true,
        edad_minima: true,
        edad_maxima: true,
      },
    }),
    vigores.length
      ? db.poliza.groupBy({
          by: ["aseguradora_id", "polizaVigor"],
          where: { agenciaId, polizaVigor: { in: vigores }, aseguradora_id: { in: aseguradoras } },
          _min: { vigencia_inicio: true },
        })
      : Promise.resolve([]),
  ]);
  const primeraVigencia = new Map(
    cadenas.map((c) => [`${c.aseguradora_id}|${c.polizaVigor}`, c._min.vigencia_inicio])
  );

  let valor = 0;
  let sinPorcentaje = 0;
  let sinPrimaNeta = 0;
  for (const r of recibos) {
    const p = r.poliza;
    const inicio = (p.polizaVigor && primeraVigencia.get(`${p.aseguradora_id}|${p.polizaVigor}`)) || p.vigencia_inicio;
    const porcentaje = resolverPorcentaje(
      {
        personalizado: p.comision_personalizada_pct !== null ? Number(p.comision_personalizada_pct) : null,
        ramo: p.ramo,
      },
      anioParaComision({
        asegurados: p.asegurados,
        vigenciaInicio: p.vigencia_inicio,
        primeraVigencia: inicio,
        fechaRecibo: r.fecha_vencimiento,
      }).anio,
      edadDelTitular(p.asegurados, r.fecha_vencimiento),
      esquemas
        .filter((e) => e.aseguradora_id === p.aseguradora_id)
        .map((e) => ({ ...e, porcentaje: Number(e.porcentaje) }))
    );
    // Base: la prima neta del recibo, nunca su monto cobrado (que sale de la prima total).
    const base = primaNetaDelRecibo(p, r.numero);
    if (!porcentaje) sinPorcentaje++;
    else if (!base) sinPrimaNeta++;
    else valor += comisionEsperada(base.primaNeta, porcentaje.valor);
  }
  return { valor: Math.round(valor * 100) / 100, recibos: recibos.length, sinPorcentaje, sinPrimaNeta };
}

async function produccionPorAseguradora(agenciaId: string, { desde, hasta }: Rango) {
  const grupos = await db.poliza.groupBy({
    by: ["aseguradora_id"],
    where: { agenciaId, vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
    _count: { _all: true },
  });
  if (grupos.length === 0) return [];
  const aseguradoras = await db.aseguradora.findMany({
    where: { agenciaId, id: { in: grupos.map((g) => g.aseguradora_id) } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(aseguradoras.map((a) => [a.id, a.nombre]));
  return grupos
    .map((g) => ({
      aseguradora: nombre.get(g.aseguradora_id) ?? "—",
      prima: Number(g._sum.prima_total ?? 0),
      polizas: g._count._all,
    }))
    .sort((a, b) => b.prima - a.prima);
}

function recibosConciliados(agenciaId: string, { desde, hasta }: Rango) {
  return db.recibo.findMany({
    // Conciliados dentro del periodo (fin de día incluido), los más recientes primero.
    where: {
      agenciaId,
      estado: "CONCILIADO",
      conciliado_at: { gte: desde, lt: new Date(hasta.getTime() + 86_400_000) },
    },
    orderBy: { conciliado_at: "desc" },
    take: LIMITE_RECIBOS,
    select: {
      id: true,
      numero: true,
      monto: true,
      fecha_vencimiento: true,
      comision_pagada: true,
      conciliado_at: true,
      poliza: {
        select: {
          id: true,
          numeroImpreso: true,
          ramo: true,
          _count: { select: { recibos: true } },
          cliente: { select: { nombre: true } },
          aseguradora: { select: { nombre: true, color_hex: true } },
        },
      },
    },
  });
}

/** Próximos vencimientos a partir de hoy; no dependen del periodo (es una alerta). */
function proximosVencimientos(agenciaId: string, hoy: Date) {
  const limite = new Date(hoy.getTime() + DIAS_PROXIMOS_VENCIMIENTOS * 86_400_000);
  return db.poliza.findMany({
    where: { agenciaId, vigencia_fin: { gte: hoy, lte: limite } },
    orderBy: { vigencia_fin: "asc" },
    take: LIMITE_VENCIMIENTOS,
    select: {
      id: true,
      numeroImpreso: true,
      ramo: true,
      vigencia_fin: true,
      // Contacto para las acciones rápidas (WhatsApp y correo) del panel de vencimientos.
      cliente: { select: { nombre: true, telefono: true, email: true } },
      aseguradora: { select: { nombre: true, color_hex: true } },
    },
  });
}

/** `incluirComisiones` es false para los ejecutivos: las comisiones ni siquiera se calculan. */
export async function getDashboard(periodo: Periodo, { incluirComisiones }: { incluirComisiones: boolean }) {
  await connection();
  const agenciaId = await getAgenciaId();
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const { actual, anterior } = rangoDePeriodo(periodo, hoyIso);

  const [primas, primasAnt, activas, activasAnt, renovacion, produccion, recibos, vencimientos, totalPolizas, pendientes] =
    await Promise.all([
      primasEmitidas(agenciaId, actual),
      primasEmitidas(agenciaId, anterior),
      polizasActivas(agenciaId, actual),
      polizasActivas(agenciaId, anterior),
      tasaRenovacion(agenciaId, actual, hoy),
      produccionPorAseguradora(agenciaId, actual),
      recibosConciliados(agenciaId, actual),
      proximosVencimientos(agenciaId, hoy),
      db.poliza.count({ where: { agenciaId } }),
      incluirComisiones ? comisionesPendientes(agenciaId, actual) : null,
    ]);

  return {
    rango: actual,
    hoy: hoyIso,
    totalPolizas,
    metricas: {
      primas: { valor: primas, variacion: variacion(primas, primasAnt) },
      activas: { valor: activas, variacion: variacion(activas, activasAnt) },
      renovacion,
      comisiones: pendientes,
    },
    produccion,
    // Sin permiso, el recibo no lleva la comisión pagada.
    recibos: incluirComisiones ? recibos : recibos.map((r) => ({ ...r, comision_pagada: null })),
    vencimientos,
  };
}
