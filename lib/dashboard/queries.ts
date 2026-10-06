import "server-only";

import { connection } from "next/server";

import { alcanceDe, clientesDe, polizasDe, recibosDe, type Alcance } from "@/lib/auth/alcance";
import { requireUser, veComisiones, type UsuarioSesion } from "@/lib/auth/dal";
import { contarRecibosEnRiesgo } from "@/lib/busqueda/queries";
import { diasParaCumpleanos, fechaNacimientoCliente } from "@/lib/clientes/reglas";
import {
  anioParaComision,
  comisionEsperada,
  edadDelTitular,
  primaNetaDelRecibo,
  resolverPorcentaje,
} from "@/lib/conciliacion/comisiones";
import { rangoDePeriodo, type Periodo, type Rango } from "@/lib/dashboard/periodos";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import { Prisma } from "@/lib/generated/prisma/client";
import { NO_CANCELADA } from "@/lib/polizas/queries";
import { contarPorRenovar, renovacionesDe } from "@/lib/renovaciones/queries";
import { getMisPendientesHoy } from "@/lib/tareas/queries";

/** Días hacia adelante que cubre la lista de próximos vencimientos. */
export const DIAS_PROXIMOS_VENCIMIENTOS = 30;
/** Días hacia adelante de la lista de cumpleaños. */
export const DIAS_CUMPLEANOS = 7;
const LIMITE_RECIBOS = 10;
const LIMITE_VENCIMIENTOS = 8;
const DIA_MS = 86_400_000;

const variacion = (actual: number, anterior: number) =>
  anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;

/** Primas de las pólizas cuya vigencia inicia en el rango (la emisión de la póliza). */
async function primasEmitidas(alcance: Alcance, { desde, hasta }: Rango) {
  const r = await db.poliza.aggregate({
    where: { ...polizasDe(alcance), vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
  });
  return Number(r._sum.prima_total ?? 0);
}

/** Pólizas en vigor (no canceladas) cuya vigencia se traslapa con el rango. */
function polizasActivas(alcance: Alcance, { desde, hasta }: Rango) {
  return db.poliza.count({
    where: { ...polizasDe(alcance), ...NO_CANCELADA, vigencia_inicio: { lte: hasta }, vigencia_fin: { gte: desde } },
  });
}

/**
 * De las pólizas que vencieron en el rango, cuántas se renovaron: existe otra póliza con la
 * misma póliza vigor y aseguradora que inicia después. Las canceladas no cuentan (no llegaron a
 * renovarse). null si ninguna venció.
 */
async function tasaRenovacion(alcance: Alcance, { desde, hasta }: Rango, hoy: Date) {
  const tope = hasta < hoy ? hasta : hoy;
  const vencidas = await db.poliza.findMany({
    where: { ...polizasDe(alcance), ...NO_CANCELADA, vigencia_fin: { gte: desde, lte: tope } },
    select: { polizaVigor: true, aseguradora_id: true, vigencia_inicio: true },
  });
  if (vencidas.length === 0) return { tasa: null, vencidas: 0, renovadas: 0 };

  const vigores = [...new Set(vencidas.map((p) => p.polizaVigor).filter((v): v is string => Boolean(v)))];
  const candidatas = vigores.length
    ? await db.poliza.findMany({
        where: { agenciaId: alcance.agenciaId, polizaVigor: { in: vigores } },
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

async function produccionPorAseguradora(alcance: Alcance, { desde, hasta }: Rango) {
  const grupos = await db.poliza.groupBy({
    by: ["aseguradora_id"],
    where: { ...polizasDe(alcance), vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
    _count: { _all: true },
  });
  if (grupos.length === 0) return [];
  const aseguradoras = await db.aseguradora.findMany({
    where: { agenciaId: alcance.agenciaId, id: { in: grupos.map((g) => g.aseguradora_id) } },
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

/** Prima emitida en el rango por ejecutivo responsable (las sin asignar, aparte). */
export async function produccionPorEjecutivo(agenciaId: string, { desde, hasta }: Rango) {
  const grupos = await db.poliza.groupBy({
    by: ["ejecutivoId"],
    where: { agenciaId, vigencia_inicio: { gte: desde, lte: hasta } },
    _sum: { prima_total: true },
    _count: { _all: true },
  });
  if (grupos.length === 0) return [];
  const ids = grupos.map((g) => g.ejecutivoId).filter((v): v is string => Boolean(v));
  const usuarios = ids.length
    ? await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
    : [];
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return grupos
    .map((g) => ({
      id: g.ejecutivoId,
      ejecutivo: g.ejecutivoId ? (nombre.get(g.ejecutivoId) ?? "Cuenta eliminada") : "Sin asignar",
      prima: Number(g._sum.prima_total ?? 0),
      polizas: g._count._all,
    }))
    .sort((a, b) => b.prima - a.prima);
}

function recibosConciliados(alcance: Alcance, { desde, hasta }: Rango) {
  return db.recibo.findMany({
    // Conciliados dentro del periodo (fin de día incluido), los más recientes primero.
    where: {
      AND: [
        recibosDe(alcance),
        { estado: "CONCILIADO", conciliado_at: { gte: desde, lt: new Date(hasta.getTime() + DIA_MS) } },
      ],
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

/**
 * Próximos vencimientos a partir de hoy; no dependen del periodo (es una alerta). Sin las
 * canceladas, las perdidas ni las que ya tienen su renovación capturada.
 */
async function proximosVencimientos(alcance: Alcance, hoy: Date) {
  const limite = new Date(hoy.getTime() + DIAS_PROXIMOS_VENCIMIENTOS * DIA_MS);
  const polizas = await db.poliza.findMany({
    where: {
      AND: [
        polizasDe(alcance),
        NO_CANCELADA,
        { OR: [{ renovacionEtapa: null }, { renovacionEtapa: { not: "PERDIDA" } }] },
        { vigencia_fin: { gte: hoy, lte: limite } },
      ],
    },
    orderBy: { vigencia_fin: "asc" },
    take: 40,
    select: {
      id: true,
      numeroImpreso: true,
      polizaVigor: true,
      aseguradora_id: true,
      ramo: true,
      vigencia_fin: true,
      renovacionEtapa: true,
      // Contacto para las acciones rápidas (WhatsApp y correo) del panel de vencimientos.
      cliente: { select: { nombre: true, telefono: true, email: true } },
      aseguradora: { select: { nombre: true, color_hex: true } },
    },
  });
  const renovaciones = await renovacionesDe(alcance.agenciaId, polizas);
  return polizas.filter((p) => !renovaciones.get(p.id)).slice(0, LIMITE_VENCIMIENTOS);
}

/** `incluirComisiones` es false para los ejecutivos: las comisiones ni siquiera se calculan. */
export async function getDashboard(periodo: Periodo, { incluirComisiones }: { incluirComisiones: boolean }) {
  await connection();
  const user = await requireUser();
  const alcance = alcanceDe(user);
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const { actual, anterior } = rangoDePeriodo(periodo, hoyIso);

  const [primas, primasAnt, activas, activasAnt, renovacion, produccion, porEjecutivo, recibos, vencimientos, totalPolizas, pendientes] =
    await Promise.all([
      primasEmitidas(alcance, actual),
      primasEmitidas(alcance, anterior),
      polizasActivas(alcance, actual),
      polizasActivas(alcance, anterior),
      tasaRenovacion(alcance, actual, hoy),
      produccionPorAseguradora(alcance, actual),
      // La producción por ejecutivo es de toda la agencia: no la ve quien solo ve su cartera.
      user.soloSuCartera ? Promise.resolve(null) : produccionPorEjecutivo(alcance.agenciaId, actual),
      recibosConciliados(alcance, actual),
      proximosVencimientos(alcance, hoy),
      db.poliza.count({ where: polizasDe(alcance) }),
      incluirComisiones ? comisionesPendientes(alcance.agenciaId, actual) : null,
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
    porEjecutivo,
    // Sin permiso, el recibo no lleva la comisión pagada.
    recibos: incluirComisiones ? recibos : recibos.map((r) => ({ ...r, comision_pagada: null })),
    vencimientos,
  };
}

/** Fechas MM-DD de hoy a `dias` adelante (con el 29 de febrero si cae el 28 de un año no bisiesto). */
function mesesDias(hoy: string, dias: number) {
  const base = Date.parse(`${hoy}T00:00:00Z`);
  const fechas = new Set<string>();
  for (let i = 0; i <= dias; i++) {
    const d = new Date(base + i * DIA_MS);
    const md = d.toISOString().slice(5, 10);
    fechas.add(md);
    const bisiesto = new Date(Date.UTC(d.getUTCFullYear(), 1, 29)).getUTCMonth() === 1;
    if (md === "02-28" && !bisiesto) fechas.add("02-29");
  }
  return [...fechas];
}

/** Clientes (personas físicas visibles) que cumplen años en los próximos días, el más cercano primero. */
async function cumpleanos(alcance: Alcance, hoy: string) {
  const fechas = mesesDias(hoy, DIAS_CUMPLEANOS);
  // Prefiltro en SQL por mes y día (de la fecha capturada o del RFC); el alcance se aplica después.
  const candidatos = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM clientes
    WHERE agencia_id = ${alcance.agenciaId}::uuid
      AND tipo_persona = 'FISICA'
      AND (
        (fecha_nacimiento IS NOT NULL AND to_char(fecha_nacimiento, 'MM-DD') = ANY(${fechas}::text[]))
        OR (
          fecha_nacimiento IS NULL
          AND length(rfc) = 13
          AND substr(rfc, 7, 2) || '-' || substr(rfc, 9, 2) = ANY(${fechas}::text[])
        )
      )
    LIMIT 200`);
  if (candidatos.length === 0) return [];
  const clientes = await db.cliente.findMany({
    where: { AND: [{ id: { in: candidatos.map((c) => c.id) } }, clientesDe(alcance)] },
    select: { id: true, nombre: true, telefono: true, rfc: true, fechaNacimiento: true, tipoPersona: true },
  });
  return clientes
    .map((c) => {
      const nacimiento = fechaNacimientoCliente(
        { fechaNacimiento: c.fechaNacimiento ? c.fechaNacimiento.toISOString().slice(0, 10) : null, rfc: c.rfc, tipoPersona: c.tipoPersona },
        hoy
      );
      return nacimiento ? { ...c, nacimiento: nacimiento.fecha, dias: diasParaCumpleanos(nacimiento.fecha, hoy) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null && c.dias <= DIAS_CUMPLEANOS)
    .sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre))
    .slice(0, 8);
}

/**
 * "Para hoy": lo que requiere acción, con un clic a su pantalla. Mis tareas vencidas o de hoy,
 * renovaciones por atender, recibos vencidos (y en riesgo), recibos que vencen en 7 días,
 * aclaraciones (solo SUPERADMIN) y cumpleaños de la semana.
 */
export async function getParaHoy(user: UsuarioSesion) {
  const alcance = alcanceDe(user);
  const hoyIso = hoyISO();
  const hoy = new Date(`${hoyIso}T00:00:00Z`);
  const [tareas, renovaciones, vencidos, riesgo, semana, aclaraciones, cumples] = await Promise.all([
    getMisPendientesHoy(user, 6),
    contarPorRenovar(alcance),
    db.recibo.count({ where: { AND: [recibosDe(alcance), { estado: "PENDIENTE", fecha_vencimiento: { lt: hoy } }] } }),
    contarRecibosEnRiesgo(alcance, hoy),
    db.recibo.aggregate({
      where: {
        AND: [
          recibosDe(alcance),
          { estado: "PENDIENTE", fecha_vencimiento: { gte: hoy, lte: new Date(hoy.getTime() + 7 * DIA_MS) } },
        ],
      },
      _count: true,
      _sum: { monto: true },
    }),
    veComisiones(user) ? db.recibo.count({ where: { agenciaId: user.agenciaId, estado: "PAGADO" } }) : Promise.resolve(null),
    cumpleanos(alcance, hoyIso),
  ]);
  return {
    tareas,
    renovaciones,
    recibos: { vencidos, riesgo, semana: { cantidad: semana._count, monto: Number(semana._sum.monto ?? 0) } },
    aclaraciones,
    cumpleanos: cumples,
  };
}
