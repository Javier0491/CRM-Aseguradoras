"use server";

import { revalidatePath } from "next/cache";

import { alcanceDe } from "@/lib/auth/alcance";
import { esAdmin, getAdmin, getConciliador, getCurrentUser, veComisiones, type UsuarioSesion } from "@/lib/auth/dal";
import { AclaracionError, registrarSeguimiento } from "@/lib/conciliacion/aclaraciones";
import { agruparPorFolio, descartarRecibosDuplicados } from "@/lib/conciliacion/agrupar";
import {
  aplicarResultados,
  cruzarEstadoDeCuenta,
  LoteNoReversibleError,
  revertirLote,
} from "@/lib/conciliacion/motor";
import {
  MAX_FILAS_ESTADO,
  TIPOS_NOTA,
  type AnalisisResultado,
  type FilaEstado,
  type ResultadoMatch,
  type ResumenMatch,
  type TipoNota,
} from "@/lib/conciliacion/tipos";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

/** Mayor monto que cabe en las columnas Decimal(14, 2). */
const MAX_MONTO = 999_999_999_999.99;
const FOLIO = /^[A-Z0-9][A-Z0-9-]{0,39}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v: string) => FECHA.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** Valida la forma de los renglones que manda el navegador (las Server Actions son públicas). */
function sanitizarFilas(raw: unknown): FilaEstado[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILAS_ESTADO) return null;
  const filas: FilaEstado[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { fila, poliza, comisionPagada, recibo, folio, fecha } = item as Record<string, unknown>;
    if (typeof fila !== "number" || typeof poliza !== "string" || typeof comisionPagada !== "number") return null;
    if (!Number.isFinite(comisionPagada) || Math.abs(comisionPagada) > MAX_MONTO || !poliza.trim()) return null;
    if (recibo !== undefined && (typeof recibo !== "number" || !Number.isInteger(recibo) || recibo < 1 || recibo > 999)) {
      return null;
    }
    if (folio !== undefined && (typeof folio !== "string" || !FOLIO.test(folio))) return null;
    if (fecha !== undefined && (typeof fecha !== "string" || !fechaValida(fecha))) return null;
    filas.push({
      fila,
      poliza: poliza.trim().slice(0, 60),
      // Centavos exactos: evita que 1520.4999999 se guarde distinto de lo que se mostró.
      comisionPagada: Math.round(comisionPagada * 100) / 100,
      ...(recibo !== undefined && { recibo }),
      ...(folio !== undefined && { folio: folio.toUpperCase() }),
      ...(fecha !== undefined && { fecha }),
    });
  }
  return filas;
}

type Validacion =
  | { ok: true; usuario: UsuarioSesion; aseguradoraId: string; filas: FilaEstado[] }
  | { ok: false; error: string };

/** Respuesta para quien no puede conciliar: su rol no lo permite o su sesión expiró. */
async function sinPermiso(accion: string) {
  return (await getCurrentUser())
    ? { ok: false as const, error: `Tu rol no permite ${accion}. Pídeselo a un administrador.` }
    : { ok: false as const, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
}

async function validar(aseguradoraId: unknown, rawFilas: unknown): Promise<Validacion> {
  // Concilian el Administrador y el Ejecutivo comercial (ver puedeConciliar).
  const usuario = await getConciliador();
  if (!usuario) return sinPermiso("conciliar la cobranza");
  if (typeof aseguradoraId !== "string") return { ok: false, error: "Selecciona la aseguradora." };
  // Solo aseguradoras de la agencia de la sesión.
  const aseguradora = await db.aseguradora.findUnique({
    where: { id: aseguradoraId, agenciaId: usuario.agenciaId },
    select: { id: true, ignoraRecibosDuplicados: true },
  });
  if (!aseguradora) return { ok: false, error: "La aseguradora no existe." };
  const filas = sanitizarFilas(rawFilas);
  if (!filas) return { ok: false, error: `El archivo no tiene renglones válidos (máximo ${MAX_FILAS_ESTADO}).` };
  // El navegador ya agrupa los folios repetidos (y descarta los recibos duplicados si la
  // aseguradora lo pide); se repite aquí porque no se confía en él.
  let limpias = agruparPorFolio(filas).filas;
  if (aseguradora.ignoraRecibosDuplicados) limpias = descartarRecibosDuplicados(limpias).filas;
  return { ok: true, usuario, aseguradoraId: aseguradora.id, filas: limpias };
}

/**
 * Cruce con el alcance de la sesión. Para quien solo ve su cartera, los renglones de pólizas
 * ajenas salen como no encontrados: se le explica que pueden ser de otra cartera.
 */
async function cruzar(v: Extract<Validacion, { ok: true }>) {
  const alcance = alcanceDe(v.usuario);
  const cruce = await cruzarEstadoDeCuenta(alcance, v.aseguradoraId, v.filas);
  if (!alcance.ejecutivoId) return cruce;
  return {
    ...cruce,
    resultados: cruce.resultados.map((r) =>
      r.estatus === "no_encontrado"
        ? { ...r, detalle: "No está en tu cartera o no está registrada con esta aseguradora." }
        : r
    ),
  };
}

/**
 * El mismo cruce sin nada de comisiones, para quien no las ve (ADMIN): ni montos, ni porcentaje,
 * ni la base del cálculo, y con explicaciones que no hablan de ellas. Los estatus no cambian.
 */
function sinComisiones(resultados: ResultadoMatch[], resumen: ResumenMatch) {
  const detalle = (r: ResultadoMatch) => {
    if (r.estatus === "diferencia") return "Cobrado según el estado de cuenta.";
    if (!r.detalle || !/comisi[oó]n/i.test(r.detalle)) return r.detalle;
    return /prima neta/i.test(r.detalle)
      ? "La póliza no tiene prima neta capturada: agrégala en su detalle y vuelve a analizar."
      : "No se pudo validar este cobro: falta configuración de la plataforma para esta póliza.";
  };
  return {
    resultados: resultados.map((r) => ({
      ...r,
      detalle: detalle(r),
      comisionPagada: 0,
      comisionEsperada: null,
      diferencia: null,
      porcentaje: null,
      base: null,
    })),
    resumen: { ...resumen, esperada: 0, pagada: 0, pagadaAutoCreada: 0, pagadaSinCruce: 0 },
  };
}

/** Cruza el estado de cuenta contra la base de datos sin modificar nada. */
export async function analizarConciliacion(aseguradoraId: string, filas: FilaEstado[]): Promise<AnalisisResultado> {
  const v = await validar(aseguradoraId, filas);
  if (!v.ok) return { ok: false, error: v.error };
  const cruce = await cruzar(v);
  const { resultados, resumen } = veComisiones(v.usuario) ? cruce : sinComisiones(cruce.resultados, cruce.resumen);
  return { ok: true, resultados, resumen };
}

export type AplicarResultado =
  | { ok: true; loteId: string | null; conciliados: number; pagados: number; creados: number }
  | { ok: false; error: string };

/**
 * Aplica el cruce (ver aplicarResultados): concilia los matches exactos, registra como PAGADO
 * los cobrados con diferencia de comisión y crea los que no existían, todo en un lote que se
 * puede revertir. El cruce se recalcula aquí: no se confía en el resultado que muestra el
 * navegador, que pudo quedar desactualizado.
 */
export async function aplicarConciliacion(
  aseguradoraId: string,
  filas: FilaEstado[],
  archivoNombre: string
): Promise<AplicarResultado> {
  const v = await validar(aseguradoraId, filas);
  if (!v.ok) return { ok: false, error: v.error };
  const nombre = typeof archivoNombre === "string" && archivoNombre.trim() ? archivoNombre.trim().slice(0, 200) : "archivo sin nombre";

  const { resultados } = await cruzar(v);
  try {
    const { loteId, conciliados, pagados, creados } = await aplicarResultados(resultados, {
      aseguradoraId: v.aseguradoraId,
      archivoNombre: nombre,
      usuario: v.usuario,
    });

    revalidarCobranza();
    return { ok: true, loteId, conciliados, pagados, creados };
  } catch (e) {
    // Otro proceso creó el mismo recibo o folio entre el cruce y la escritura: nada se guardó.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Algunos recibos cambiaron mientras se aplicaba. Vuelve a analizar el cruce." };
    }
    console.error("[aplicarConciliacion]", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo aplicar la conciliación; no se guardó ningún cambio." };
  }
}

function revalidarCobranza() {
  revalidatePath("/");
  // Listado y detalle de cada póliza: su avance de recibos cambió.
  revalidatePath("/polizas", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/conciliacion", "layout");
}

export type RevertirResultado = { ok: true; restaurados: number; borrados: number } | { ok: false; error: string };

/**
 * Revierte un lote de conciliación (ver revertirLote). El administrador revierte cualquiera; el
 * ejecutivo comercial, solo los que aplicó él.
 */
export async function revertirLoteConciliacion(loteId: string): Promise<RevertirResultado> {
  const usuario = await getConciliador();
  if (!usuario) return sinPermiso("revertir una conciliación");
  if (typeof loteId !== "string" || !/^[a-z0-9]+$/i.test(loteId)) return { ok: false, error: "Datos inválidos." };
  if (!esAdmin(usuario)) {
    const lote = await db.loteConciliacion.findUnique({
      where: { id: loteId, agenciaId: usuario.agenciaId },
      select: { usuario_id: true },
    });
    if (lote && lote.usuario_id !== usuario.id) {
      return { ok: false, error: "Solo quien aplicó la conciliación o un administrador la puede revertir." };
    }
  }
  try {
    const { restaurados, borrados } = await revertirLote(loteId, usuario);
    revalidarCobranza();
    return { ok: true, restaurados, borrados };
  } catch (e) {
    if (e instanceof LoteNoReversibleError) return { ok: false, error: e.message };
    console.error("[revertirLoteConciliacion]", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo revertir el lote; no se cambió nada." };
  }
}

export type AclaracionInput = { tipo: string; texto: string; monto?: number };
export type AclaracionResultado = { ok: true; conciliado: boolean } | { ok: false; error: string };

/**
 * Seguimiento de un recibo PAGADO con diferencia de comisión:
 * - nota / reclamo: queda en el historial (reclamo marca el recibo como "reclamado").
 * - pago_adicional: suma la comisión recibida después; si ya coincide con la esperada, el recibo
 *   queda CONCILIADO.
 * - aceptada: se acepta la diferencia y el recibo queda CONCILIADO con lo que se pagó.
 */
export async function registrarAclaracion(reciboId: string, raw: AclaracionInput): Promise<AclaracionResultado> {
  const admin = await getAdmin();
  // Las aclaraciones son diferencias de comisión: solo el SUPERADMIN.
  if (!admin || !veComisiones(admin)) {
    return (await getCurrentUser())
      ? { ok: false, error: "Solo un superadministrador puede dar seguimiento a las aclaraciones." }
      : { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }
  if (typeof reciboId !== "string" || !/^[a-z0-9]+$/i.test(reciboId) || typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Datos inválidos." };
  }
  const tipo = raw.tipo as TipoNota;
  if (!(TIPOS_NOTA as readonly string[]).includes(tipo)) return { ok: false, error: "Tipo de seguimiento inválido." };
  const texto = typeof raw.texto === "string" ? raw.texto.trim().slice(0, 1000) : "";
  if (!texto) return { ok: false, error: "Escribe una nota que explique el seguimiento." };
  let monto: number | null = null;
  if (tipo === "pago_adicional") {
    if (typeof raw.monto !== "number" || !Number.isFinite(raw.monto) || raw.monto <= 0 || raw.monto > 999_999_999) {
      return { ok: false, error: "Indica el monto adicional recibido (mayor a cero)." };
    }
    monto = Math.round(raw.monto * 100) / 100;
  }

  try {
    const { conciliado } = await registrarSeguimiento(reciboId, { tipo, texto, monto }, admin);
    revalidarCobranza();
    return { ok: true, conciliado };
  } catch (e) {
    if (e instanceof AclaracionError) return { ok: false, error: e.message };
    console.error("[registrarAclaracion]", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo guardar el seguimiento." };
  }
}

