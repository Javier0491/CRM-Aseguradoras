import "server-only";

import { connection } from "next/server";

import type { UsuarioSesion } from "@/lib/auth/dal";
import { leerConfigCanales, type ConfigCanales, type RamoCotizador } from "@/lib/cotizador/aseguradoras";
import type { DatosCotizacionGMM } from "@/lib/cotizador/gmm";
import type { DatosCotizacionAuto, ResultadoCotizacion } from "@/lib/cotizador/reglas";
import { db } from "@/lib/db";
import type { EstadoCotizacion } from "@/lib/generated/prisma/client";

export const LIMITE_SOLICITUDES = 50;

type Comun = {
  id: string;
  aseguradora: string;
  estado: EstadoCotizacion;
  resultado: ResultadoCotizacion | null;
  error: string | null;
  pedidaPor: string | null;
  createdAt: string;
  tomadaAt: string | null;
  terminadaAt: string | null;
  /** El robot subió el PDF oficial de la aseguradora (se descarga en /cotizador/{id}/pdf). */
  tienePdf: boolean;
  /** Envío del multicotizador al que pertenece (las de un mismo grupo se comparan juntas). */
  grupoId: string | null;
};

/** Una solicitud para la pantalla; `ramo` dice qué forma tienen los datos. */
export type SolicitudVista = Comun & ({ ramo: "AUTOS"; datos: DatosCotizacionAuto } | { ramo: "GMM"; datos: DatosCotizacionGMM });

/**
 * Últimas solicitudes de cotización de la agencia en ese ramo. Quien solo ve su cartera ve solo las que pidió.
 */
export async function getSolicitudes(user: UsuarioSesion, ramo: RamoCotizador = "AUTOS"): Promise<SolicitudVista[]> {
  await connection();
  const filas = await db.solicitudCotizacion.findMany({
    where: { agenciaId: user.agenciaId, ramo, ...(user.soloSuCartera ? { creadoPorId: user.id } : {}) },
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
      grupoId: true,
      creadoPor: { select: { nombre: true } },
    },
  });
  return filas.map((f) => ({
    id: f.id,
    aseguradora: f.aseguradora,
    estado: f.estado,
    ...(ramo === "GMM"
      ? { ramo: "GMM" as const, datos: f.datos as DatosCotizacionGMM }
      : { ramo: "AUTOS" as const, datos: f.datos as DatosCotizacionAuto }),
    resultado: (f.resultado as ResultadoCotizacion | null) ?? null,
    error: f.error,
    pedidaPor: f.creadoPor?.nombre ?? null,
    createdAt: f.createdAt.toISOString(),
    tomadaAt: f.tomadaAt?.toISOString() ?? null,
    terminadaAt: f.terminadaAt?.toISOString() ?? null,
    tienePdf: Boolean(f.pdfClave),
    grupoId: f.grupoId,
  }));
}

/** Qué eligió la agencia en Conexiones (robot, API o apagada) por aseguradora y ramo. */
export async function getConfigCanales(agenciaId: string): Promise<ConfigCanales> {
  await connection();
  const a = await db.agencia.findUnique({ where: { id: agenciaId }, select: { cotizadorCanales: true } });
  return leerConfigCanales(a?.cotizadorCanales);
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
