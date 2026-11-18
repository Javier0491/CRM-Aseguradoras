import "server-only";

import { llaveDeEncabezado, hashLlave } from "@/lib/cotizador/llave";
import { MINUTOS_ABANDONO, type DatosCotizacionAuto, type ResultadoCotizacion } from "@/lib/cotizador/reglas";
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
 * solo uno se queda con cada solicitud.
 */
export async function tomarSiguiente(agenciaId: string): Promise<TrabajoRobot | null> {
  const limiteAbandono = new Date(Date.now() - MINUTOS_ABANDONO * 60_000);
  const disponible: Prisma.SolicitudCotizacionWhereInput = {
    agenciaId,
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
