import "server-only";

import { clientesDe, polizasDe, recibosDe, type Alcance } from "@/lib/auth/alcance";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import type { Prisma, Ramo as RamoDb } from "@/lib/generated/prisma/client";
import { RAMO_DB, RAMOS, ramoDesdeDb, ramoLabels } from "@/lib/polizas/ramos";
import { enSeguimiento } from "@/lib/polizas/seguimiento";
import { sumarDias } from "@/lib/plataforma/cobranza";

// Herramientas con las que el asistente consulta la cartera. Todas filtran por el alcance de la
// sesión (agencia y, si aplica, la cartera del ejecutivo) y devuelven solo lo necesario: nunca
// comisiones ni datos de otra agencia.

const MAX_RESULTADOS = 15;

const fecha = (d: Date) => d.toISOString().slice(0, 10);
const diaDb = (iso: string) => new Date(`${iso}T00:00:00Z`);
const etiquetaRamo = (r: RamoDb) => {
  const ramo = ramoDesdeDb(r);
  return ramo ? ramoLabels[ramo] : r;
};

/** Ramo del formulario a partir de lo que mande el modelo ("Autos", "GMM Individual", "autos"). */
function ramoDesdeTexto(v: unknown): RamoDb | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim().toLowerCase();
  const ramo = RAMOS.find((r) => r === t || ramoLabels[r].toLowerCase() === t);
  return ramo ? RAMO_DB[ramo] : null;
}

const texto = (v: unknown, max = 60) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const entero = (v: unknown, min: number, max: number, def: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : def;

async function resumenCartera(alcance: Alcance) {
  const hoy = diaDb(hoyISO());
  const en30 = diaDb(sumarDias(hoyISO(), 30));
  const vigentes = { ...polizasDe(alcance), canceladaAt: null, vigencia_fin: { gte: hoy } };
  const pendientes = { AND: [recibosDe(alcance), enSeguimiento(hoy)] };
  const [porRamo, vencidos, porVencer, renovaciones] = await Promise.all([
    db.poliza.groupBy({ by: ["ramo"], where: vigentes, _count: true, _sum: { prima_total: true } }),
    db.recibo.aggregate({ where: { AND: [pendientes, { fecha_vencimiento: { lt: hoy } }] }, _count: true, _sum: { monto: true } }),
    db.recibo.aggregate({
      where: { AND: [pendientes, { fecha_vencimiento: { gte: hoy, lte: en30 } }] },
      _count: true,
      _sum: { monto: true },
    }),
    db.poliza.count({ where: { ...vigentes, vigencia_fin: { gte: hoy, lte: en30 } } }),
  ]);
  return {
    hoy: hoyISO(),
    polizas_vigentes: porRamo.reduce((s, r) => s + r._count, 0),
    por_ramo: porRamo.map((r) => ({ ramo: etiquetaRamo(r.ramo), polizas: r._count, prima_total: Number(r._sum.prima_total ?? 0) })),
    recibos_vencidos: { cantidad: vencidos._count, monto: Number(vencidos._sum.monto ?? 0) },
    recibos_por_vencer_30_dias: { cantidad: porVencer._count, monto: Number(porVencer._sum.monto ?? 0) },
    renovaciones_proximos_30_dias: renovaciones,
  };
}

async function buscarPolizas(alcance: Alcance, args: Record<string, unknown>) {
  const hoyIso = hoyISO();
  const filtros: Prisma.PolizaWhereInput[] = [polizasDe(alcance)];
  const t = texto(args.texto);
  if (t) {
    const contiene = { contains: t, mode: "insensitive" as const };
    filtros.push({ OR: [{ numeroImpreso: contiene }, { polizaVigor: contiene }, { cliente: { nombre: contiene } }] });
  }
  const ramo = ramoDesdeTexto(args.ramo);
  if (ramo) filtros.push({ ramo });
  const aseguradora = texto(args.aseguradora);
  if (aseguradora) filtros.push({ aseguradora: { nombre: { contains: aseguradora, mode: "insensitive" } } });
  if (args.solo_vigentes === true) filtros.push({ canceladaAt: null, vigencia_fin: { gte: diaDb(hoyIso) } });
  if (typeof args.vencen_en_dias === "number") {
    const dias = entero(args.vencen_en_dias, 0, 365, 30);
    filtros.push({ canceladaAt: null, vigencia_fin: { gte: diaDb(hoyIso), lte: diaDb(sumarDias(hoyIso, dias)) } });
  }
  const polizas = await db.poliza.findMany({
    where: { AND: filtros },
    orderBy: { vigencia_fin: typeof args.vencen_en_dias === "number" ? "asc" : "desc" },
    take: MAX_RESULTADOS,
    select: {
      id: true,
      numeroImpreso: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_total: true,
      forma_pago: true,
      canceladaAt: true,
      cliente: { select: { nombre: true } },
      aseguradora: { select: { nombre: true } },
    },
  });
  return {
    resultados: polizas.map((p) => ({
      enlace: `/polizas/${p.id}`,
      numero: p.numeroImpreso,
      cliente: p.cliente.nombre,
      aseguradora: p.aseguradora.nombre,
      ramo: etiquetaRamo(p.ramo),
      vigencia: `${fecha(p.vigencia_inicio)} a ${fecha(p.vigencia_fin)}`,
      estado: p.canceladaAt ? "cancelada" : fecha(p.vigencia_fin) < hoyIso ? "vencida" : "vigente",
      prima_total: Number(p.prima_total),
      forma_pago: p.forma_pago,
    })),
    hay_mas: polizas.length === MAX_RESULTADOS,
  };
}

async function detallePoliza(alcance: Alcance, args: Record<string, unknown>) {
  const numero = texto(args.numero);
  if (!numero) return { error: "Indica el número de póliza." };
  const p = await db.poliza.findFirst({
    where: {
      ...polizasDe(alcance),
      OR: [
        { numeroImpreso: { equals: numero, mode: "insensitive" } },
        { polizaVigor: { equals: numero, mode: "insensitive" } },
      ],
    },
    orderBy: { vigencia_fin: "desc" },
    select: {
      id: true,
      numeroImpreso: true,
      polizaVigor: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_total: true,
      prima_neta: true,
      forma_pago: true,
      datos_ramo: true,
      sumaAseguradaIlimitada: true,
      canceladaAt: true,
      motivoCancelacion: true,
      cliente: { select: { id: true, nombre: true, telefono: true, email: true } },
      aseguradora: { select: { nombre: true } },
      recibos: {
        orderBy: { numero: "asc" },
        select: { numero: true, monto: true, fecha_vencimiento: true, estado: true },
      },
    },
  });
  if (!p) return { error: `No encontré la póliza ${numero} en tu cartera.` };
  return {
    enlace: `/polizas/${p.id}`,
    numero: p.numeroImpreso,
    poliza_vigor: p.polizaVigor,
    aseguradora: p.aseguradora.nombre,
    ramo: etiquetaRamo(p.ramo),
    vigencia: `${fecha(p.vigencia_inicio)} a ${fecha(p.vigencia_fin)}`,
    cancelada: p.canceladaAt ? { fecha: fecha(p.canceladaAt), motivo: p.motivoCancelacion } : null,
    prima_total: Number(p.prima_total),
    prima_neta: p.prima_neta === null ? null : Number(p.prima_neta),
    forma_pago: p.forma_pago,
    suma_asegurada_sin_limite: p.sumaAseguradaIlimitada,
    datos_del_ramo: p.datos_ramo,
    cliente: { enlace: `/clientes/${p.cliente.id}`, nombre: p.cliente.nombre, telefono: p.cliente.telefono, email: p.cliente.email },
    recibos: p.recibos.map((r) => ({
      numero: r.numero,
      monto: Number(r.monto),
      vence: fecha(r.fecha_vencimiento),
      estado: r.estado,
    })),
  };
}

async function buscarClientes(alcance: Alcance, args: Record<string, unknown>) {
  const t = texto(args.texto);
  if (t.length < 2) return { error: "Escribe al menos dos letras del nombre, RFC, teléfono o correo." };
  const contiene = { contains: t, mode: "insensitive" as const };
  const clientes = await db.cliente.findMany({
    where: { AND: [clientesDe(alcance), { OR: [{ nombre: contiene }, { rfc: contiene }, { telefono: contiene }, { email: contiene }] }] },
    orderBy: { nombre: "asc" },
    take: MAX_RESULTADOS,
    select: {
      id: true,
      nombre: true,
      rfc: true,
      telefono: true,
      email: true,
      polizas: {
        where: polizasDe(alcance),
        orderBy: { vigencia_fin: "desc" },
        take: 10,
        select: { id: true, numeroImpreso: true, ramo: true, vigencia_fin: true, canceladaAt: true, aseguradora: { select: { nombre: true } } },
      },
    },
  });
  return {
    resultados: clientes.map((c) => ({
      enlace: `/clientes/${c.id}`,
      nombre: c.nombre,
      rfc: c.rfc,
      telefono: c.telefono,
      email: c.email,
      polizas: c.polizas.map((p) => ({
        enlace: `/polizas/${p.id}`,
        numero: p.numeroImpreso,
        aseguradora: p.aseguradora.nombre,
        ramo: etiquetaRamo(p.ramo),
        vence: fecha(p.vigencia_fin),
        cancelada: p.canceladaAt !== null,
      })),
    })),
  };
}

async function recibosPendientes(alcance: Alcance, args: Record<string, unknown>) {
  const hoyIso = hoyISO();
  const dias = entero(args.dias, 0, 90, 15);
  const recibos = await db.recibo.findMany({
    where: {
      AND: [
        recibosDe(alcance),
        enSeguimiento(diaDb(hoyIso)),
        { fecha_vencimiento: dias === 0 ? { lt: diaDb(hoyIso) } : { lte: diaDb(sumarDias(hoyIso, dias)) } },
      ],
    },
    orderBy: { fecha_vencimiento: "asc" },
    take: 25,
    select: {
      numero: true,
      monto: true,
      fecha_vencimiento: true,
      poliza: {
        select: {
          id: true,
          numeroImpreso: true,
          forma_pago: true,
          cliente: { select: { nombre: true, telefono: true } },
          aseguradora: { select: { nombre: true, diasGracia: true } },
        },
      },
    },
  });
  return {
    hoy: hoyIso,
    resultados: recibos.map((r) => ({
      poliza: r.poliza.numeroImpreso,
      enlace: `/polizas/${r.poliza.id}`,
      cliente: r.poliza.cliente.nombre,
      telefono: r.poliza.cliente.telefono,
      aseguradora: r.poliza.aseguradora.nombre,
      dias_de_gracia: r.poliza.aseguradora.diasGracia,
      recibo: r.numero,
      monto: Number(r.monto),
      vence: fecha(r.fecha_vencimiento),
      vencido: fecha(r.fecha_vencimiento) < hoyIso,
    })),
    hay_mas: recibos.length === 25,
  };
}

/** Ejecuta una herramienta con los argumentos (JSON) que mandó el modelo. */
export async function ejecutarHerramienta(alcance: Alcance, nombre: string, argumentos: string): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(argumentos || "{}");
    if (typeof parsed === "object" && parsed !== null) args = parsed as Record<string, unknown>;
  } catch {
    return { error: "Argumentos inválidos." };
  }
  switch (nombre) {
    case "resumen_cartera":
      return resumenCartera(alcance);
    case "buscar_polizas":
      return buscarPolizas(alcance, args);
    case "detalle_poliza":
      return detallePoliza(alcance, args);
    case "buscar_clientes":
      return buscarClientes(alcance, args);
    case "recibos_pendientes":
      return recibosPendientes(alcance, args);
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}
