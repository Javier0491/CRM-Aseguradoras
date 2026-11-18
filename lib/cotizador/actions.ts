"use server";

import { revalidatePath } from "next/cache";

import { getAdmin, getUsuarioCrm } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import {
  canalDe,
  claveCanal,
  leerConfigCanales,
  nombreAseguradora,
  validarEleccionCanal,
  type RamoCotizador,
} from "@/lib/cotizador/aseguradoras";
import { generarLlave, hashLlave } from "@/lib/cotizador/llave";
import { ASEGURADORAS_GMM, validarDatosGMM } from "@/lib/cotizador/gmm";
import { validarAseguradoras, validarDatosCotizacion } from "@/lib/cotizador/reglas";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

type Resultado = { ok: true } | { ok: false; error: string };

/** Máximo de solicitudes en espera por agencia: evita llenar la fila por un doble clic repetido. */
const MAX_EN_ESPERA = 30;

/**
 * Multicotizador: pide la misma cotización a varias aseguradoras. Crea una solicitud PENDIENTE por
 * aseguradora, todas con el mismo grupo para compararlas; el robot (o la API, cuando exista) las
 * resuelve una por una. `entrada` lleva los datos del formulario más `aseguradoras: string[]` y
 * `ramo` ("AUTOS" si no viene; "GMM" para gastos médicos).
 */
export async function crearSolicitudCotizacion(entrada: unknown): Promise<Resultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión venció. Vuelve a iniciar sesión." };
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Datos inválidos." };
  const { aseguradoras, ramo: ramoEntrada } = entrada as { aseguradoras?: unknown; ramo?: unknown };
  const ramo = ramoEntrada === undefined || ramoEntrada === "AUTOS" ? "AUTOS" : ramoEntrada === "GMM" ? "GMM" : null;
  if (!ramo) return { ok: false, error: "Ese ramo todavía no se puede cotizar." };
  const a = ramo === "GMM" ? validarAseguradoras(aseguradoras, ASEGURADORAS_GMM) : validarAseguradoras(aseguradoras);
  if (!a.ok) return a;
  const solicitudes: { aseguradora: string }[] = [];
  for (const aseguradora of a.valor) {
    const v = ramo === "GMM" ? validarDatosGMM({ ...entrada, aseguradora }) : validarDatosCotizacion({ ...entrada, aseguradora });
    if (!v.ok) return v;
    solicitudes.push(v.valor);
  }

  // Cada aseguradora debe estar encendida en Conexiones y con un canal que ya funcione (hoy, el robot).
  const agencia = await db.agencia.findUnique({ where: { id: user.agenciaId }, select: { cotizadorCanales: true } });
  const config = leerConfigCanales(agencia?.cotizadorCanales);
  for (const aseguradora of a.valor) {
    const canal = canalDe(aseguradora, ramo, config);
    if (canal === null) return { ok: false, error: `${nombreAseguradora(aseguradora)} está apagada en Conexiones.` };
    if (canal !== "ROBOT") return { ok: false, error: `La API de ${nombreAseguradora(aseguradora)} todavía no cotiza.` };
  }

  const enEspera = await db.solicitudCotizacion.count({
    where: { agenciaId: user.agenciaId, estado: { in: ["PENDIENTE", "COTIZANDO"] } },
  });
  if (enEspera + solicitudes.length > MAX_EN_ESPERA) {
    return { ok: false, error: `Ya hay ${enEspera} cotizaciones en espera. Espera a que el robot avance.` };
  }

  const grupoId = solicitudes.length > 1 ? crypto.randomUUID() : null;
  await db.solicitudCotizacion.createMany({
    data: solicitudes.map((datos) => ({
      agenciaId: user.agenciaId,
      aseguradora: datos.aseguradora,
      ramo,
      datos: datos as unknown as Prisma.InputJsonValue,
      creadoPorId: user.id,
      grupoId,
    })),
  });
  revalidatePath("/cotizador");
  return { ok: true };
}

/** Cancela una solicitud que todavía no termina. Quien solo ve su cartera, solo las suyas. */
export async function cancelarSolicitudCotizacion(id: string): Promise<Resultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión venció. Vuelve a iniciar sesión." };
  if (typeof id !== "string") return { ok: false, error: "Datos inválidos." };
  const { count } = await db.solicitudCotizacion.updateMany({
    where: {
      id,
      agenciaId: user.agenciaId,
      estado: { in: ["PENDIENTE", "COTIZANDO"] },
      ...(user.soloSuCartera ? { creadoPorId: user.id } : {}),
    },
    data: { estado: "CANCELADA", terminadaAt: new Date() },
  });
  revalidatePath("/cotizador");
  return count === 1 ? { ok: true } : { ok: false, error: "La cotización ya terminó o no existe." };
}

/** Vuelve a poner en la fila una solicitud que falló o se canceló. */
export async function reintentarSolicitudCotizacion(id: string): Promise<Resultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión venció. Vuelve a iniciar sesión." };
  if (typeof id !== "string") return { ok: false, error: "Datos inválidos." };
  const { count } = await db.solicitudCotizacion.updateMany({
    where: {
      id,
      agenciaId: user.agenciaId,
      estado: { in: ["ERROR", "CANCELADA"] },
      ...(user.soloSuCartera ? { creadoPorId: user.id } : {}),
    },
    data: { estado: "PENDIENTE", error: null, tomadaAt: null, terminadaAt: null },
  });
  revalidatePath("/cotizador");
  return count === 1 ? { ok: true } : { ok: false, error: "Esa cotización no se puede reintentar." };
}

/**
 * Conexiones (solo ADMIN): elige si una aseguradora cotiza un ramo con el robot, con la API o si
 * queda apagada para la agencia.
 */
export async function cambiarCanalCotizador(clave: unknown, ramo: unknown, eleccion: unknown): Promise<Resultado> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede cambiar las conexiones." };
  const error = validarEleccionCanal(clave, ramo, eleccion);
  if (error) return { ok: false, error };
  const k = claveCanal(clave as string, ramo as RamoCotizador);
  await db.$transaction(async (tx) => {
    const a = await tx.agencia.findUnique({ where: { id: admin.agenciaId }, select: { cotizadorCanales: true } });
    const config = { ...leerConfigCanales(a?.cotizadorCanales), [k]: eleccion };
    await tx.agencia.update({ where: { id: admin.agenciaId }, data: { cotizadorCanales: config as Prisma.InputJsonValue } });
    const texto = eleccion === "APAGADO" ? "apagó" : `puso en ${eleccion === "API" ? "API" : "robot"}`;
    await registrarBitacora(
      admin,
      {
        accion: "cotizador.conexion",
        entidad: "agencia",
        entidadId: admin.agenciaId,
        descripcion: `Multicotizador: ${texto} ${nombreAseguradora(clave as string)} (${ramo})`,
      },
      tx
    );
  });
  revalidatePath("/cotizador");
  return { ok: true };
}

/**
 * Genera una llave nueva para el robot de la agencia (solo ADMIN) y la devuelve para mostrarla una
 * sola vez. La anterior deja de servir en ese momento.
 */
export async function generarLlaveRobot(): Promise<{ ok: true; llave: string } | { ok: false; error: string }> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede generar la llave del robot." };
  const llave = generarLlave();
  await db.$transaction(async (tx) => {
    await tx.agencia.update({
      where: { id: admin.agenciaId },
      data: { cotizadorTokenHash: hashLlave(llave), cotizadorVistoAt: null },
    });
    await registrarBitacora(
      admin,
      { accion: "cotizador.llave", entidad: "agencia", entidadId: admin.agenciaId, descripcion: "Generó una llave nueva del robot cotizador" },
      tx
    );
  });
  revalidatePath("/cotizador");
  return { ok: true, llave };
}

/** Revoca la llave del robot (solo ADMIN): la computadora de la oficina deja de poder cotizar. */
export async function revocarLlaveRobot(): Promise<Resultado> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede revocar la llave del robot." };
  await db.$transaction(async (tx) => {
    await tx.agencia.update({
      where: { id: admin.agenciaId },
      data: { cotizadorTokenHash: null, cotizadorVistoAt: null },
    });
    await registrarBitacora(
      admin,
      { accion: "cotizador.llave", entidad: "agencia", entidadId: admin.agenciaId, descripcion: "Revocó la llave del robot cotizador" },
      tx
    );
  });
  revalidatePath("/cotizador");
  return { ok: true };
}
