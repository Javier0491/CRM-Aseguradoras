import "server-only";

import { connection } from "next/server";

import { getAlcance, polizasDe, recibosDe, type Alcance } from "@/lib/auth/alcance";
import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import type { Prisma, Ramo } from "@/lib/generated/prisma/client";
import type { Opcion } from "@/lib/polizas/ramos";
import { enSeguimiento } from "@/lib/polizas/seguimiento";

export const LIMITE_LISTADO = 200;

/** Opción del selector de aseguradora, con sus reglas de cobranza (captura y conciliación). */
export type OpcionAseguradora = Opcion & { usaPolizaVigor: boolean; ignoraRecibosDuplicados: boolean };

export async function getAseguradorasOpciones(): Promise<OpcionAseguradora[]> {
  await connection();
  const agenciaId = await getAgenciaId();
  const rows = await db.aseguradora.findMany({
    where: { agenciaId },
    select: { id: true, nombre: true, usaPolizaVigor: true, ignoraRecibosDuplicados: true },
    orderBy: { nombre: "asc" },
  });
  return rows.map((a) => ({
    value: a.id,
    label: a.nombre,
    usaPolizaVigor: a.usaPolizaVigor,
    ignoraRecibosDuplicados: a.ignoraRecibosDuplicados,
  }));
}

/** Días antes del fin de vigencia en que una póliza se considera "por vencer". */
export const DIAS_POR_VENCER = 30;

/** Póliza que sigue en vigor: no está cancelada. */
export const NO_CANCELADA = { canceladaAt: null } as const satisfies Prisma.PolizaWhereInput;

export type FiltrosPolizas = {
  /** Texto libre: número de póliza, póliza vigor, cliente, RFC o asegurado. */
  q?: string;
  ramo?: Ramo;
  /** Solo las pólizas cuyo cliente no tiene teléfono o correo (ver FiltroContacto). */
  faltaContacto?: FiltroContacto;
  /** Ejecutivo responsable: su id, o "sin" para las que no tienen. */
  ejecutivo?: string;
  /** Estatus: en vigor (no canceladas), vigentes hoy, canceladas, o todas (""). */
  estatus?: EstatusPolizas;
  /** Id de la aseguradora. */
  aseguradora?: string;
};

/**
 * Estatus del filtro del listado. "vigor": no canceladas; "vigentes": además, en vigencia hoy (las
 * mismas que cuenta Aseguradoras como pólizas vigentes).
 */
export const ESTATUS_POLIZAS = ["vigor", "vigentes", "canceladas"] as const;
export type EstatusPolizas = "" | (typeof ESTATUS_POLIZAS)[number];
export const esEstatusPolizas = (v: unknown): v is EstatusPolizas =>
  typeof v === "string" && (ESTATUS_POLIZAS as readonly string[]).includes(v);

/** Póliza vigente en `hoy`: no cancelada y dentro de su vigencia. */
export const vigenteEn = (hoy: Date) =>
  ({ canceladaAt: null, vigencia_inicio: { lte: hoy }, vigencia_fin: { gte: hoy } }) satisfies Prisma.PolizaWhereInput;

const WHERE_ESTATUS: Record<Exclude<EstatusPolizas, "">, () => Prisma.PolizaWhereInput> = {
  vigor: () => NO_CANCELADA,
  vigentes: () => vigenteEn(new Date(`${hoyISO()}T00:00:00Z`)),
  canceladas: () => ({ canceladaAt: { not: null } }),
};

/** Cliente sin teléfono o sin correo: se capturó sin ellos y hay que completarlos. */
const CLIENTE_SIN_CONTACTO: Prisma.PolizaWhereInput = {
  cliente: { OR: [{ telefono: "" }, { email: "" }] },
};

/**
 * Filtro de contacto del listado: le falta alguno de los dos, o solo el teléfono, solo el correo
 * o ambos (los mismos casos que el aviso "Falta teléfono", "Falta correo" y "Falta contacto").
 */
export const FILTROS_CONTACTO = ["falta", "telefono", "correo", "ambos"] as const;
export type FiltroContacto = (typeof FILTROS_CONTACTO)[number];
export const esFiltroContacto = (v: unknown): v is FiltroContacto =>
  typeof v === "string" && (FILTROS_CONTACTO as readonly string[]).includes(v);

const WHERE_CONTACTO: Record<FiltroContacto, Prisma.PolizaWhereInput> = {
  falta: CLIENTE_SIN_CONTACTO,
  telefono: { cliente: { telefono: "", NOT: { email: "" } } },
  correo: { cliente: { email: "", NOT: { telefono: "" } } },
  ambos: { cliente: { telefono: "", email: "" } },
};

/** Filtro del listado de pólizas, siempre acotado a lo que ve la sesión. Lo comparten el listado y su exportación. */
function wherePolizas(alcance: Alcance, filtros: FiltrosPolizas): Prisma.PolizaWhereInput {
  const q = filtros.q?.trim().slice(0, 100);
  const contiene = (valor: string) => ({ contains: valor, mode: "insensitive" as const });
  const ejecutivo = filtros.ejecutivo?.slice(0, 64);
  return {
    AND: [
      polizasDe(alcance),
      filtros.ramo ? { ramo: filtros.ramo } : {},
      filtros.faltaContacto ? WHERE_CONTACTO[filtros.faltaContacto] : {},
      ejecutivo ? { ejecutivoId: ejecutivo === "sin" ? null : ejecutivo } : {},
      filtros.estatus ? WHERE_ESTATUS[filtros.estatus]() : {},
      filtros.aseguradora ? { aseguradora_id: filtros.aseguradora.slice(0, 64) } : {},
      q
        ? {
            OR: [
              { numeroImpreso: contiene(q) },
              { polizaVigor: contiene(q) },
              { cliente: { nombre: contiene(q) } },
              { cliente: { rfc: contiene(q) } },
              { asegurados: { some: { nombre: contiene(q) } } },
            ],
          }
        : {},
    ],
  };
}

export async function getPolizasListado(filtros: FiltrosPolizas = {}) {
  await connection();
  const alcance = await getAlcance();
  const where = wherePolizas(alcance, filtros);
  const visibles = polizasDe(alcance);

  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const limite = new Date(hoy.getTime() + DIAS_POR_VENCER * 86_400_000);

  const [polizas, total, totalGeneral, porVencer, faltaContacto, canceladas] = await Promise.all([
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
        canceladaAt: true,
        ejecutivo: { select: { nombre: true } },
        cliente: { select: { nombre: true, rfc: true, telefono: true, email: true } },
        aseguradora: { select: { nombre: true, color_hex: true } },
        recibos: { select: { estado: true } },
        // Para el resumen de asegurados: el titular y cuántos son en total.
        asegurados: { where: { parentesco: "Titular" }, select: { nombre: true }, take: 1 },
        _count: { select: { asegurados: true } },
      },
    }),
    db.poliza.count({ where }),
    db.poliza.count({ where: visibles }),
    db.poliza.count({ where: { ...visibles, ...NO_CANCELADA, vigencia_fin: { gte: hoy, lte: limite } } }),
    db.poliza.count({ where: { ...visibles, ...NO_CANCELADA, ...CLIENTE_SIN_CONTACTO } }),
    db.poliza.count({ where: { ...visibles, canceladaAt: { not: null } } }),
  ]);
  return { polizas, total, totalGeneral, porVencer, faltaContacto, canceladas };
}

/** Cartera completa (sin el límite del listado) con los mismos filtros, para el reporte descargable. */
export async function getPolizasExportacion(filtros: FiltrosPolizas = {}) {
  await connection();
  const alcance = await getAlcance();
  return db.poliza.findMany({
    where: wherePolizas(alcance, filtros),
    orderBy: { created_at: "desc" },
    select: {
      numeroImpreso: true,
      polizaVigor: true,
      cadenaId: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_total: true,
      forma_pago: true,
      canceladaAt: true,
      ejecutivo: { select: { nombre: true } },
      cliente: { select: { nombre: true, rfc: true, telefono: true, email: true } },
      aseguradora: { select: { nombre: true } },
      asegurados: { where: { parentesco: "Titular" }, select: { nombre: true }, take: 1 },
    },
  });
}

/** Filtros rápidos de la pestaña de recibos. */
export const FILTROS_RECIBOS = [
  { value: "todos", label: "Todos" },
  { value: "pendientes", label: "Pendientes" },
  { value: "vencidos", label: "Vencidos" },
  { value: "semana", label: "Vencen en 7 días" },
] as const;
export type FiltroRecibos = (typeof FILTROS_RECIBOS)[number]["value"];
export const esFiltroRecibos = (v: unknown): v is FiltroRecibos =>
  typeof v === "string" && FILTROS_RECIBOS.some((f) => f.value === v);

export async function getRecibosListado(filtro: FiltroRecibos = "todos") {
  await connection();
  const alcance = await getAlcance();
  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const enSieteDias = new Date(hoy.getTime() + 7 * 86_400_000);
  const porFiltro: Record<FiltroRecibos, Prisma.ReciboWhereInput> = {
    todos: {},
    // Solo los que llevan seguimiento: no los históricos ni los de pólizas vencidas o canceladas.
    pendientes: enSeguimiento(hoy),
    vencidos: { ...enSeguimiento(hoy), fecha_vencimiento: { lt: hoy } },
    semana: { ...enSeguimiento(hoy), fecha_vencimiento: { gte: hoy, lte: enSieteDias } },
  };
  const where: Prisma.ReciboWhereInput = { AND: [recibosDe(alcance), porFiltro[filtro]] };
  const [recibos, total, pendientes] = await Promise.all([
    db.recibo.findMany({
      where,
      orderBy: [{ fecha_vencimiento: "asc" }, { numero: "asc" }],
      take: LIMITE_LISTADO,
      select: {
        id: true,
        numero: true,
        monto: true,
        fecha_vencimiento: true,
        estado: true,
        historico: true,
        poliza: {
          select: {
            id: true,
            numeroImpreso: true,
            vigencia_fin: true,
            canceladaAt: true,
            _count: { select: { recibos: true } },
            cliente: { select: { nombre: true } },
            aseguradora: { select: { nombre: true, color_hex: true, diasGracia: true } },
          },
        },
      },
    }),
    db.recibo.count({ where }),
    db.recibo.aggregate({
      where: { AND: [recibosDe(alcance), enSeguimiento(hoy)] },
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
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  const alcance = await getAlcance();
  return db.poliza.findFirst({
    where: { id, ...polizasDe(alcance) },
    select: {
      id: true,
      numeroImpreso: true,
      polizaVigor: true,
      cadenaId: true,
      aseguradora_id: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_total: true,
      prima_neta: true,
      forma_pago: true,
      created_at: true,
      comision_personalizada_pct: true,
      datos_ramo: true,
      sumaAseguradaIlimitada: true,
      canceladaAt: true,
      motivoCancelacion: true,
      renovacionEtapa: true,
      renovacionNota: true,
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
      ejecutivo: { select: { id: true, nombre: true } },
      cliente: { select: { id: true, nombre: true, rfc: true, telefono: true, email: true } },
      aseguradora: { select: { nombre: true, color_hex: true, diasGracia: true } },
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
        select: {
          id: true,
          numero: true,
          monto: true,
          fecha_vencimiento: true,
          estado: true,
          folio: true,
          auto_creado: true,
          historico: true,
        },
      },
      endosos: {
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        select: { id: true, numero: true, tipo: true, fecha: true, descripcion: true, prima: true, usuarioEmail: true },
      },
    },
  });
}
