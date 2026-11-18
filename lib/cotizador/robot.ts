import "server-only";

import { getAlmacen } from "@/lib/archivos/almacen";
import { llaveDeEncabezado, hashLlave } from "@/lib/cotizador/llave";
import {
  clavePdfCotizacion,
  esPdf,
  MAX_BYTES_PDF,
  MINUTOS_ABANDONO,
  type DatosCotizacionAuto,
  type ResultadoCotizacion,
} from "@/lib/cotizador/reglas";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Agencia dueña de la llave del encabezado Authorization, o null si la llave no existe o la
 * agencia está suspendida. Cada llamada registra que el robot está encendido.
 */
export async function agenciaDelRobot(authorization: string | null): Promise<string | null> {
  const llave = llaveDeEncabezado(authorization);
  if (!llave) return null;
  const agencia = await db.agencia.findUnique({
    where: { cotizadorTokenHash: hashLlave(llave) },
    select: { id: true, suspendida: true },
  });
  if (!agencia || agencia.suspendida) return null;
  await db.agencia.update({ where: { id: agencia.id }, data: { cotizadorVistoAt: new Date() } });
  return agencia.id;
}

export type TrabajoRobot = {
  id: string;
  aseguradora: string;
  datos: DatosCotizacionAuto;
  pedidaPor: string | null;
  createdAt: Date;
};

/**
 * Toma la solicitud más antigua de la agencia que esté pendiente (o abandonada a medias: en
 * COTIZANDO desde hace más de MINUTOS_ABANDONO) y la marca COTIZANDO. Si dos robots piden a la vez,
 * solo uno se queda con cada solicitud. `aseguradoras` limita a los portales con sesión abierta en la
 * oficina (null = cualquiera); las de otras aseguradoras esperan en la fila.
 */
export async function tomarSiguiente(agenciaId: string, aseguradoras: string[] | null = null): Promise<TrabajoRobot | null> {
  if (aseguradoras && aseguradoras.length === 0) return null;
  const limiteAbandono = new Date(Date.now() - MINUTOS_ABANDONO * 60_000);
  const disponible: Prisma.SolicitudCotizacionWhereInput = {
    agenciaId,
    ...(aseguradoras ? { aseguradora: { in: aseguradoras } } : {}),
    OR: [{ estado: "PENDIENTE" }, { estado: "COTIZANDO", tomadaAt: { lt: limiteAbandono } }],
  };
  for (let intento = 0; intento < 3; intento++) {
    const candidata = await db.solicitudCotizacion.findFirst({
      where: disponible,
      orderBy: { createdAt: "asc" },
      select: { id: true, aseguradora: true, datos: true, createdAt: true, creadoPor: { select: { nombre: true } } },
    });
    if (!candidata) return null;
    const { count } = await db.solicitudCotizacion.updateMany({
      where: { id: candidata.id, ...disponible },
      data: { estado: "COTIZANDO", tomadaAt: new Date(), error: null },
    });
    if (count === 1) {
      return {
        id: candidata.id,
        aseguradora: candidata.aseguradora,
        datos: candidata.datos as DatosCotizacionAuto,
        pedidaPor: candidata.creadoPor?.nombre ?? null,
        createdAt: candidata.createdAt,
      };
    }
  }
  return null;
}

/**
 * Guarda lo que devolvió el robot. Solo sobre una solicitud de la agencia que siga en COTIZANDO
 * (si alguien la canceló mientras tanto, el resultado se descarta).
 */
export async function guardarResultado(
  agenciaId: string,
  id: string,
  salida: { resultado: ResultadoCotizacion } | { error: string }
): Promise<boolean> {
  const { count } = await db.solicitudCotizacion.updateMany({
    where: { id, agenciaId, estado: "COTIZANDO" },
    data:
      "resultado" in salida
        ? { estado: "LISTA", resultado: salida.resultado as unknown as Prisma.InputJsonValue, error: null, terminadaAt: new Date() }
        : { estado: "ERROR", error: salida.error, terminadaAt: new Date() },
  });
  return count === 1;
}

export type ResultadoPdf = { ok: true; bytes: number } | { ok: false; status: 404 | 413 | 415; error: string };

/**
 * Guarda el PDF oficial de la aseguradora de una solicitud ya LISTA de la agencia. Si ya tenía uno
 * (el robot lo reenvió), lo reemplaza y borra el anterior.
 */
export async function guardarPdf(agenciaId: string, id: string, contenido: Uint8Array): Promise<ResultadoPdf> {
  if (contenido.byteLength === 0 || contenido.byteLength > MAX_BYTES_PDF) {
    return { ok: false, status: 413, error: `El PDF está vacío o pasa de ${MAX_BYTES_PDF / 1024 / 1024} MB.` };
  }
  if (!esPdf(contenido)) return { ok: false, status: 415, error: "El archivo no es un PDF." };

  const solicitud = await db.solicitudCotizacion.findFirst({
    where: { id, agenciaId, estado: "LISTA" },
    select: { pdfClave: true },
  });
  if (!solicitud) return { ok: false, status: 404, error: "No hay una cotización lista con ese id." };

  const almacen = getAlmacen();
  const clave = clavePdfCotizacion(agenciaId, id);
  await almacen.guardar(clave, contenido, "application/pdf");

  const { count } = await db.solicitudCotizacion.updateMany({
    where: { id, agenciaId, estado: "LISTA" },
    data: { pdfClave: clave, pdfBytes: contenido.byteLength },
  });
  const sobra = count === 1 ? solicitud.pdfClave : clave;
  if (sobra) await almacen.eliminar([sobra]).catch((e) => console.error("[cotizador/pdf] no se borró", e instanceof Error ? e.message : e));
  if (count !== 1) return { ok: false, status: 404, error: "La cotización cambió mientras se subía el PDF." };
  return { ok: true, bytes: contenido.byteLength };
}
