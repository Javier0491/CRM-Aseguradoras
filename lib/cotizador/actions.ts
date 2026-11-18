"use server";

import { revalidatePath } from "next/cache";

import { getAdmin, getUsuarioCrm } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { generarLlave, hashLlave } from "@/lib/cotizador/llave";
import { validarAseguradoras, validarDatosCotizacion } from "@/lib/cotizador/reglas";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

type Resultado = { ok: true } | { ok: false; error: string };

/** Máximo de solicitudes en espera por agencia: evita llenar la fila por un doble clic repetido. */
const MAX_EN_ESPERA = 30;

/**
 * Multicotizador: pide la misma cotización a varias aseguradoras. Crea una solicitud PENDIENTE por
 * aseguradora, todas con el mismo grupo para compararlas; el robot (o la API, cuando exista) las
 * resuelve una por una. `entrada` lleva los datos del formulario más `aseguradoras: string[]`.
 */
export async function crearSolicitudCotizacion(entrada: unknown): Promise<Resultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión venció. Vuelve a iniciar sesión." };
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Datos inválidos." };
  const a = validarAseguradoras((entrada as { aseguradoras?: unknown }).aseguradoras);
  if (!a.ok) return a;
  const solicitudes = [];
  for (const aseguradora of a.valor) {
    const v = validarDatosCotizacion({ ...entrada, aseguradora });
    if (!v.ok) return v;
    solicitudes.push(v.valor);
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
