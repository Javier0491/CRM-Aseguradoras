import "server-only";

import { connection } from "next/server";

import type { UsuarioSesion } from "@/lib/auth/dal";
import type { DatosCotizacionAuto, ResultadoCotizacion } from "@/lib/cotizador/reglas";
import { db } from "@/lib/db";
import type { EstadoCotizacion } from "@/lib/generated/prisma/client";

export const LIMITE_SOLICITUDES = 50;

export type SolicitudVista = {
  id: string;
  aseguradora: string;
  estado: EstadoCotizacion;
  datos: DatosCotizacionAuto;
  resultado: ResultadoCotizacion | null;
  error: string | null;
  pedidaPor: string | null;
  createdAt: string;
  tomadaAt: string | null;
  terminadaAt: string | null;
  /** El robot subió el PDF oficial de la aseguradora (se descarga en /cotizador/{id}/pdf). */
  tienePdf: boolean;
};

/**
 * Últimas solicitudes de cotización de la agencia. Quien solo ve su cartera ve solo las que pidió.
 */
export async function getSolicitudes(user: UsuarioSesion): Promise<SolicitudVista[]> {
  await connection();
  const filas = await db.solicitudCotizacion.findMany({
    where: { agenciaId: user.agenciaId, ...(user.soloSuCartera ? { creadoPorId: user.id } : {}) },
    orderBy: { createdAt: "desc" },
    take: LIMITE_SOLICITUDES,
    select: {
      id: true,
      aseguradora: true,
      estado: true,
      datos: true,
      resultado: true,
      error: true,
      createdAt: true,
      tomadaAt: true,
      terminadaAt: true,
      pdfClave: true,
      creadoPor: { select: { nombre: true } },
    },
  });
  return filas.map((f) => ({
    id: f.id,
    aseguradora: f.aseguradora,
    estado: f.estado,
    datos: f.datos as DatosCotizacionAuto,
    resultado: (f.resultado as ResultadoCotizacion | null) ?? null,
    error: f.error,
    pedidaPor: f.creadoPor?.nombre ?? null,
    createdAt: f.createdAt.toISOString(),
    tomadaAt: f.tomadaAt?.toISOString() ?? null,
    terminadaAt: f.terminadaAt?.toISOString() ?? null,
    tienePdf: Boolean(f.pdfClave),
  }));
}

export type EstadoRobot = {
  configurado: boolean;
  /** Minutos desde que el robot pidió trabajo por última vez (null = nunca). */
  minutosDesdeVisto: number | null;
};

/** ¿La agencia tiene llave del robot y hace cuánto pidió trabajo por última vez? */
export async function getEstadoRobot(agenciaId: string): Promise<EstadoRobot> {
  await connection();
  const a = await db.agencia.findUnique({
    where: { id: agenciaId },
    select: { cotizadorTokenHash: true, cotizadorVistoAt: true },
  });
  const visto = a?.cotizadorVistoAt;
  return {
    configurado: Boolean(a?.cotizadorTokenHash),
    minutosDesdeVisto: visto ? Math.max(0, Math.floor((Date.now() - visto.getTime()) / 60_000)) : null,
  };
}
