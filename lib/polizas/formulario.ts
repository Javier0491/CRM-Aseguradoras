import "server-only";

import { connection } from "next/server";

import type { PolizaFormInicial } from "@/components/captura/poliza-form";
import { getAlcance, polizasDe } from "@/lib/auth/alcance";
import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { ramoDesdeDb, seccionesPorRamo } from "@/lib/polizas/ramos";
import { sumarMeses } from "@/lib/polizas/recibos";
import type { Valores } from "@/lib/polizas/validacion";

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function cargar(id: string) {
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  const alcance = await getAlcance();
  return db.poliza.findFirst({
    where: { id, ...polizasDe(alcance) },
    select: {
      ejecutivoId: true,
      canceladaAt: true,
      id: true,
      numeroImpreso: true,
      polizaVigor: true,
      ramo: true,
      aseguradora_id: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_total: true,
      prima_neta: true,
      forma_pago: true,
      datos_ramo: true,
      sumaAseguradaIlimitada: true,
      comision_personalizada_pct: true,
      cliente: { select: { nombre: true, rfc: true, telefono: true, email: true } },
      asegurados: {
        orderBy: { orden: "asc" },
        select: { nombre: true, parentesco: true, edad: true, sexo: true, fecha_nacimiento: true, antiguedad: true },
      },
      recibos: { select: { estado: true, auto_creado: true } },
    },
  });
}
type PolizaFormulario = NonNullable<Awaited<ReturnType<typeof cargar>>>;

/** Valores del formulario de captura a partir de una póliza guardada. */
function aFormulario(p: PolizaFormulario, { incluirComision }: { incluirComision: boolean }): PolizaFormInicial {
  const ramo = ramoDesdeDb(p.ramo) ?? "otros";
  const datos = (typeof p.datos_ramo === "object" && p.datos_ramo !== null && !Array.isArray(p.datos_ramo)
    ? p.datos_ramo
    : {}) as Record<string, unknown>;
  const especificos: Valores = {};
  for (const campo of seccionesPorRamo[ramo].flatMap((s) => s.campos)) {
    const v = datos[campo.name];
    if (v === null || v === undefined || v === "") continue;
    especificos[campo.name] = campo.type === "currency" && typeof v === "number" ? v.toFixed(2) : String(v);
  }
  return {
    ramo,
    generales: {
      cliente: p.cliente.nombre,
      rfcCliente: p.cliente.rfc,
      telefono: p.cliente.telefono,
      email: p.cliente.email,
      aseguradora: p.aseguradora_id,
      numeroImpreso: p.numeroImpreso,
      polizaVigor: p.polizaVigor ?? "",
      vigenciaInicio: iso(p.vigencia_inicio),
      vigenciaFin: iso(p.vigencia_fin),
      primaTotal: Number(p.prima_total).toFixed(2),
      primaNeta: p.prima_neta === null ? "" : Number(p.prima_neta).toFixed(2),
      formaPago: p.forma_pago,
      comisionPersonalizadaPct:
        incluirComision && p.comision_personalizada_pct !== null ? String(Number(p.comision_personalizada_pct)) : "",
    },
    especificos,
    asegurados: p.asegurados.map((a) => ({
      nombre: a.nombre,
      parentesco: a.parentesco,
      edad: a.edad === null ? "" : String(a.edad),
      sexo: a.sexo ?? "",
      fecha_nacimiento: a.fecha_nacimiento ?? "",
      antiguedad: a.antiguedad ?? "",
    })),
    sumaAseguradaIlimitada: p.sumaAseguradaIlimitada,
    ejecutivoId: p.ejecutivoId ?? "",
  };
}

/**
 * Datos para editar una póliza. `conCobros`: tiene recibos pagados, conciliados o auto-creados,
 * así que su calendario (vigencia, forma de pago y prima total) no se puede cambiar.
 */
export async function getPolizaParaEditar(id: string, { incluirComision }: { incluirComision: boolean }) {
  await connection();
  const p = await cargar(id);
  if (!p) return null;
  return {
    id: p.id,
    numero: p.numeroImpreso,
    conCobros: p.recibos.some((r) => r.estado !== "PENDIENTE" || r.auto_creado),
    cancelada: p.canceladaAt !== null,
    inicial: aFormulario(p, { incluirComision }),
  };
}

/** Meses completos entre dos fechas (duración de la vigencia); 12 si no se puede calcular. */
function mesesDeVigencia(inicio: Date, fin: Date) {
  const meses = (fin.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + (fin.getUTCMonth() - inicio.getUTCMonth());
  return meses > 0 && meses <= 120 ? meses : 12;
}

/**
 * Datos iniciales para renovar una póliza: el mismo contratante, aseguradora, ramo, número
 * original (se conserva en toda la cadena), forma de pago, datos del ramo y asegurados (con su
 * antigüedad). La nueva vigencia empieza donde terminó la anterior y dura lo mismo. La póliza
 * vigor y las primas quedan vacías: cambian en cada renovación y las trae la carátula nueva.
 */
export async function getPolizaParaRenovar(id: string, { incluirComision }: { incluirComision: boolean }) {
  await connection();
  const p = await cargar(id);
  if (!p) return null;
  const base = aFormulario(p, { incluirComision });
  const inicio = iso(p.vigencia_fin);
  return {
    id: p.id,
    numero: p.numeroImpreso,
    polizaVigor: p.polizaVigor,
    cancelada: p.canceladaAt !== null,
    inicial: {
      ...base,
      generales: {
        ...base.generales,
        numeroImpreso: p.numeroImpreso,
        polizaVigor: "",
        vigenciaInicio: inicio,
        vigenciaFin: sumarMeses(inicio, mesesDeVigencia(p.vigencia_inicio, p.vigencia_fin)),
        primaTotal: "",
        primaNeta: "",
      },
      // La edad cambia con los años; la antigüedad (que define el año de la póliza) se conserva.
      asegurados: base.asegurados?.map((a) => ({ ...a, edad: "" })),
    } satisfies PolizaFormInicial,
  };
}

/** Renovación ya capturada de una póliza: otra póliza de su cadena que empieza cuando termina. */
export async function getRenovacion(poliza: { cadenaId: string; vigencia_fin: Date }) {
  const agenciaId = await getAgenciaId();
  return db.poliza.findFirst({
    where: { agenciaId, cadenaId: poliza.cadenaId, vigencia_inicio: { gte: poliza.vigencia_fin } },
    orderBy: { vigencia_inicio: "asc" },
    select: { id: true, numeroImpreso: true },
  });
}

/** Póliza que esta renueva: la vigencia anterior de su cadena (termina cuando esta empieza o antes). */
export async function getPolizaAnterior(poliza: { id: string; cadenaId: string; vigencia_inicio: Date }) {
  const agenciaId = await getAgenciaId();
  return db.poliza.findFirst({
    where: { agenciaId, id: { not: poliza.id }, cadenaId: poliza.cadenaId, vigencia_fin: { lte: poliza.vigencia_inicio } },
    orderBy: { vigencia_fin: "desc" },
    select: { id: true, numeroImpreso: true },
  });
}
