import "server-only";

import { connection } from "next/server";

import { rangoDePeriodo, type Periodo, type Rango } from "@/lib/dashboard/periodos";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";

/** Días hacia adelante que cubre la lista de próximos vencimientos. */
export const DIAS_PROXIMOS_VENCIMIENTOS = 30;
const LIMITE_RECIBOS = 10;
const LIMITE_VENCIMIENTOS = 8;

const variacion = (actual: number, anterior: number) =>
  anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;

/** Primas de las pólizas cuya vigencia inicia en el rango (la emisión de la póliza). */
async function primasEmitidas({ desde, hasta }: Rango) {
  const r = await db.poliza.aggregate({
    where: { vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
  });
  return Number(r._sum.prima_total ?? 0);
}

/** Pólizas cuya vigencia se traslapa con el rango. */
function polizasActivas({ desde, hasta }: Rango) {
  return db.poliza.count({ where: { vigencia_inicio: { lte: hasta }, vigencia_fin: { gte: desde } } });
}

/**
 * De las pólizas que vencieron en el rango, cuántas se renovaron: existe otra póliza con la
 * misma póliza vigor y aseguradora que inicia después. null si ninguna venció.
 */
async function tasaRenovacion({ desde, hasta }: Rango, hoy: Date) {
  const tope = hasta < hoy ? hasta : hoy;
  const vencidas = await db.poliza.findMany({
    where: { vigencia_fin: { gte: desde, lte: tope } },
    select: { polizaVigor: true, aseguradora_id: true, vigencia_inicio: true },
  });
  if (vencidas.length === 0) return { tasa: null, vencidas: 0, renovadas: 0 };

  const vigores = [...new Set(vencidas.map((p) => p.polizaVigor).filter((v): v is string => Boolean(v)))];
  const candidatas = vigores.length
    ? await db.poliza.findMany({
        where: { polizaVigor: { in: vigores } },
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

async function produccionPorAseguradora({ desde, hasta }: Rango) {
  const grupos = await db.poliza.groupBy({
    by: ["aseguradora_id"],
    where: { vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
    _count: { _all: true },
  });
  if (grupos.length === 0) return [];
  const aseguradoras = await db.aseguradora.findMany({
    where: { id: { in: grupos.map((g) => g.aseguradora_id) } },
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

function recibosConciliados({ desde, hasta }: Rango) {
  return db.recibo.findMany({
    where: { estado: "CONCILIADO", fecha_vencimiento: { gte: desde, lte: hasta } },
    orderBy: { fecha_vencimiento: "desc" },
    take: LIMITE_RECIBOS,
    select: {
      id: true,
      numero: true,
      monto: true,
      fecha_vencimiento: true,
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
function proximosVencimientos(hoy: Date) {
  const limite = new Date(hoy.getTime() + DIAS_PROXIMOS_VENCIMIENTOS * 86_400_000);
  return db.poliza.findMany({
    where: { vigencia_fin: { gte: hoy, lte: limite } },
    orderBy: { vigencia_fin: "asc" },
    take: LIMITE_VENCIMIENTOS,
    select: {
      id: true,
      numeroImpreso: true,
      ramo: true,
      vigencia_fin: true,
      cliente: { select: { nombre: true } },
      aseguradora: { select: { nombre: true, color_hex: true } },
    },
  });
}

export async function getDashboard(periodo: Periodo) {
  await connection();
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const { actual, anterior } = rangoDePeriodo(periodo, hoyIso);

  const [primas, primasAnt, activas, activasAnt, renovacion, produccion, recibos, vencimientos, totalPolizas] =
    await Promise.all([
      primasEmitidas(actual),
      primasEmitidas(anterior),
      polizasActivas(actual),
      polizasActivas(anterior),
      tasaRenovacion(actual, hoy),
      produccionPorAseguradora(actual),
      recibosConciliados(actual),
      proximosVencimientos(hoy),
      db.poliza.count(),
    ]);

  return {
    rango: actual,
    hoy: hoyIso,
    totalPolizas,
    metricas: {
      primas: { valor: primas, variacion: variacion(primas, primasAnt) },
      activas: { valor: activas, variacion: variacion(activas, activasAnt) },
      renovacion,
      // Aún no existe un registro de comisiones: la tarjeta muestra "Sin datos".
      comisiones: { valor: null as number | null, variacion: null as number | null },
    },
    produccion,
    recibos,
    vencimientos,
  };
}
