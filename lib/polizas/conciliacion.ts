import "server-only";

import { connection } from "next/server";

import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatFecha } from "@/lib/format";
import type { Ramo } from "@/lib/generated/prisma/client";
import {
  normalizarNumero,
  numerosParecidos,
  type TipoMotivo,
  type TipoNoEncontrada,
} from "@/lib/polizas/conciliacion-motivos";
import { extraerPolizaVigor } from "@/lib/polizas/polizaParser";

type AseguradoraInfo = { nombre: string; color_hex: string };

export type PolizaConciliada = {
  id: string;
  numeroImpreso: string;
  cliente: string;
  ramo: Ramo;
  aseguradora: AseguradoraInfo;
  conciliados: number;
  recibos: number;
  ultimaConciliacion: Date | null;
};

export type PolizaSinConciliar = {
  id: string;
  numeroImpreso: string;
  polizaVigor: string | null;
  cliente: string;
  rfc: string;
  ramo: Ramo;
  aseguradora: AseguradoraInfo;
  vigenciaInicio: Date;
  vigenciaFin: Date;
  recibos: number;
  motivo: { tipo: TipoMotivo; texto: string };
  /** Número con el que aparece en el estado de cuenta (solo en numero_distinto). */
  numeroEnArchivo: string | null;
};

export type RenglonNoEncontrado = {
  aseguradora: AseguradoraInfo;
  polizaArchivo: string;
  archivo: string;
  fila: number;
  fecha: Date;
  /** En cuántos estados de cuenta vigentes apareció sin encontrarse. */
  veces: number;
  comisionPagada: number;
  estado: { tipo: TipoNoEncontrada; texto: string };
  /** Póliza del CRM relacionada (registrada o parecida). */
  poliza: { id: string; numeroImpreso: string } | null;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const fecha = (d: Date) => formatFecha(d);

/**
 * Estado de conciliación de la cartera: pólizas con al menos un recibo conciliado, pólizas sin
 * ninguno (con el motivo más probable) y renglones de estados de cuenta cuya póliza no se
 * encontró. Solo cuentan los lotes no revertidos.
 */
export async function getEstadoConciliacion() {
  await connection();
  const agenciaId = await getAgenciaId();

  const [polizas, lotes, renglones] = await Promise.all([
    db.poliza.findMany({
      where: { agenciaId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        numeroImpreso: true,
        polizaVigor: true,
        ramo: true,
        vigencia_inicio: true,
        vigencia_fin: true,
        aseguradora_id: true,
        cliente: { select: { nombre: true, rfc: true } },
        aseguradora: { select: { nombre: true, color_hex: true, usaPolizaVigor: true } },
        recibos: { select: { estado: true, fecha_vencimiento: true, conciliado_at: true } },
      },
    }),
    db.loteConciliacion.findMany({
      where: { agenciaId, revertido_at: null },
      select: { aseguradora_id: true, created_at: true },
    }),
    db.loteRenglon.findMany({
      where: { agenciaId, lote: { revertido_at: null } },
      orderBy: [{ lote: { created_at: "desc" } }, { fila: "asc" }],
      select: {
        fila: true,
        poliza_archivo: true,
        estatus: true,
        detalle: true,
        comision_pagada: true,
        poliza_id: true,
        lote: {
          select: {
            created_at: true,
            archivo_nombre: true,
            aseguradora_id: true,
            aseguradora: { select: { nombre: true, color_hex: true, usaPolizaVigor: true } },
          },
        },
      },
    }),
  ]);

  const lotesPor = new Map<string, Date[]>();
  for (const l of lotes) lotesPor.set(l.aseguradora_id, [...(lotesPor.get(l.aseguradora_id) ?? []), l.created_at]);

  // Por revisar: el más reciente de cada póliza (vienen ordenados del más nuevo al más viejo).
  const revisarPor = new Map<string, (typeof renglones)[number]>();
  for (const r of renglones) {
    if (r.estatus === "revisar" && r.poliza_id && !revisarPor.has(r.poliza_id)) revisarPor.set(r.poliza_id, r);
  }

  // No encontrados: uno por aseguradora y número, el más reciente, con cuántas veces apareció.
  const noEncontrados = new Map<string, { renglon: (typeof renglones)[number]; veces: number; numero: string }>();
  for (const r of renglones) {
    if (r.estatus !== "no_encontrado") continue;
    const numero = normalizarNumero(r.poliza_archivo);
    const clave = `${r.lote.aseguradora_id}|${numero}`;
    const previo = noEncontrados.get(clave);
    if (previo) previo.veces++;
    else noEncontrados.set(clave, { renglon: r, veces: 1, numero });
  }
  const noEncontradosPor = new Map<string, { renglon: (typeof renglones)[number]; numero: string }[]>();
  for (const n of noEncontrados.values()) {
    const id = n.renglon.lote.aseguradora_id;
    noEncontradosPor.set(id, [...(noEncontradosPor.get(id) ?? []), n]);
  }

  const conciliadas: PolizaConciliada[] = [];
  const sinConciliar: PolizaSinConciliar[] = [];
  const conciliadaPorId = new Set<string>();

  for (const p of polizas) {
    const aseguradora = { nombre: p.aseguradora.nombre, color_hex: p.aseguradora.color_hex };
    const conciliados = p.recibos.filter((r) => r.estado === "CONCILIADO");
    if (conciliados.length > 0) {
      conciliadaPorId.add(p.id);
      conciliadas.push({
        id: p.id,
        numeroImpreso: p.numeroImpreso,
        cliente: p.cliente.nombre,
        ramo: p.ramo,
        aseguradora,
        conciliados: conciliados.length,
        recibos: p.recibos.length,
        ultimaConciliacion: conciliados.reduce<Date | null>(
          (max, r) => (r.conciliado_at && (!max || r.conciliado_at > max) ? r.conciliado_at : max),
          null
        ),
      });
      continue;
    }

    const numero = normalizarNumero(p.numeroImpreso);
    let numeroEnArchivo: string | null = null;
    const motivo = ((): { tipo: TipoMotivo; texto: string } => {
      const fechasLotes = lotesPor.get(p.aseguradora_id) ?? [];
      if (fechasLotes.length === 0) {
        return {
          tipo: "sin_estado_cuenta",
          texto: `Aún no se concilia ningún estado de cuenta de ${aseguradora.nombre}.`,
        };
      }
      const pagados = p.recibos.filter((r) => r.estado === "PAGADO").length;
      if (pagados > 0) {
        return {
          tipo: "diferencia",
          texto: `${plural(pagados, "recibo cobrado", "recibos cobrados")} con diferencia de comisión: acláralo en Conciliación → Aclaraciones.`,
        };
      }
      const revisar = revisarPor.get(p.id);
      if (revisar) {
        return {
          tipo: "revisar",
          texto: `${revisar.detalle ?? "Renglón por revisar."} (fila ${revisar.fila} de «${revisar.lote.archivo_nombre}»)`,
        };
      }
      const vigor = p.aseguradora.usaPolizaVigor ? p.polizaVigor : null;
      const parecido = (noEncontradosPor.get(p.aseguradora_id) ?? []).find(
        (n) =>
          numerosParecidos(n.numero, numero) ||
          (vigor !== null && numerosParecidos(normalizarNumero(extraerPolizaVigor(n.renglon.poliza_archivo)), vigor))
      );
      if (parecido) {
        numeroEnArchivo = parecido.renglon.poliza_archivo;
        return {
          tipo: "numero_distinto",
          texto:
            `El estado de cuenta «${parecido.renglon.lote.archivo_nombre}» (fila ${parecido.renglon.fila}) trae ` +
            `«${parecido.renglon.poliza_archivo}» y en el CRM está como «${p.numeroImpreso}»: revisa cuál es el correcto.`,
        };
      }
      const primerVencimiento = p.recibos.reduce<Date | null>(
        (min, r) => (!min || r.fecha_vencimiento < min ? r.fecha_vencimiento : min),
        null
      );
      const ultimoLote = fechasLotes.reduce((max, f) => (f > max ? f : max));
      if (!primerVencimiento || primerVencimiento > ultimoLote) {
        return {
          tipo: "aun_no_toca",
          texto: primerVencimiento
            ? `Su primer recibo vence el ${fecha(primerVencimiento)}, después del último estado de cuenta conciliado (${fecha(ultimoLote)}).`
            : "No tiene recibos registrados.",
        };
      }
      const despues = fechasLotes.filter((f) => f >= primerVencimiento).length;
      return {
        tipo: "no_aparece",
        texto:
          `No aparece en ${despues > 0 ? plural(despues, "estado de cuenta", "estados de cuenta") : "los estados de cuenta"} ` +
          `de ${aseguradora.nombre} conciliados desde que venció su primer recibo (${fecha(primerVencimiento)}).`,
      };
    })();

    sinConciliar.push({
      id: p.id,
      numeroImpreso: p.numeroImpreso,
      polizaVigor: p.polizaVigor,
      cliente: p.cliente.nombre,
      rfc: p.cliente.rfc,
      ramo: p.ramo,
      aseguradora,
      vigenciaInicio: p.vigencia_inicio,
      vigenciaFin: p.vigencia_fin,
      recibos: p.recibos.length,
      motivo,
      numeroEnArchivo,
    });
  }

  const polizasPor = new Map<string, typeof polizas>();
  for (const p of polizas) polizasPor.set(p.aseguradora_id, [...(polizasPor.get(p.aseguradora_id) ?? []), p]);

  const noEncontradas: RenglonNoEncontrado[] = [];
  for (const { renglon: r, veces, numero } of noEncontrados.values()) {
    const candidatas = polizasPor.get(r.lote.aseguradora_id) ?? [];
    const vigor = r.lote.aseguradora.usaPolizaVigor ? extraerPolizaVigor(r.poliza_archivo) : null;
    const exacta = candidatas.find(
      (p) => normalizarNumero(p.numeroImpreso) === numero || (vigor !== null && p.polizaVigor === vigor)
    );
    // Ya se capturó y se concilió en un lote posterior: resuelto.
    if (exacta && conciliadaPorId.has(exacta.id)) continue;
    const parecida = exacta ? null : candidatas.find((p) => numerosParecidos(numero, normalizarNumero(p.numeroImpreso)));
    const relacionada = exacta ?? parecida ?? null;
    noEncontradas.push({
      aseguradora: { nombre: r.lote.aseguradora.nombre, color_hex: r.lote.aseguradora.color_hex },
      polizaArchivo: r.poliza_archivo,
      archivo: r.lote.archivo_nombre,
      fila: r.fila,
      fecha: r.lote.created_at,
      veces,
      comisionPagada: Number(r.comision_pagada),
      estado: exacta
        ? {
            tipo: "registrada",
            texto: `Ya se capturó como «${exacta.numeroImpreso}»: vuelve a subir el estado de cuenta para conciliarla.`,
          }
        : parecida
          ? {
              tipo: "parecida",
              texto: `En el CRM hay una póliza «${parecida.numeroImpreso}» con un número parecido: revisa si está mal capturado.`,
            }
          : { tipo: "no_registrada", texto: "La póliza no está registrada en el CRM con esta aseguradora: captúrala." },
      poliza: relacionada ? { id: relacionada.id, numeroImpreso: relacionada.numeroImpreso } : null,
    });
  }

  return { conciliadas, sinConciliar, noEncontradas };
}

export type EstadoConciliacion = Awaited<ReturnType<typeof getEstadoConciliacion>>;
