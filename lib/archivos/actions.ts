"use server";

import { revalidatePath } from "next/cache";

import { getAlmacen } from "@/lib/archivos/almacen";
import type { SubidaFirmada } from "@/lib/archivos/almacen/tipos";
import {
  ARCHIVOS,
  COLUMNAS_ARCHIVO,
  esTipoArchivo,
  rutaArchivoValida,
  type TipoArchivo,
} from "@/lib/archivos/config";
import { alcanceDe, polizasDe } from "@/lib/auth/alcance";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export type PrepararSubidaResultado =
  | ({ ok: true; clave: string } & SubidaFirmada)
  | { ok: false; error: string };

export type VincularArchivoResultado =
  | { ok: true; archivo: { nombre: string; bytes: number } }
  | { ok: false; error: string };

type Referencia = { path: string; nombre: string; bytes: number; subido: Date };

function camposPoliza(tipo: TipoArchivo, r: Referencia): Prisma.PolizaUpdateInput {
  const c = COLUMNAS_ARCHIVO[tipo];
  return { [c.path]: r.path, [c.nombre]: r.nombre, [c.bytes]: r.bytes, [c.subido]: r.subido };
}

const SESION_EXPIRADA = "Tu sesión expiró. Vuelve a iniciar sesión.";

/**
 * Paso 1 de la subida: valida y devuelve una URL firmada para que el navegador suba el
 * archivo directo al almacenamiento (Supabase o R2), sin pasar por el servidor de Next.
 */
export async function prepararSubida(
  polizaId: string,
  tipo: TipoArchivo,
  bytes: number
): Promise<PrepararSubidaResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION_EXPIRADA };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId) || !esTipoArchivo(tipo)) {
    return { ok: false, error: "Datos inválidos." };
  }
  const def = ARCHIVOS[tipo];
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0 || bytes > def.maxBytes) {
    return { ok: false, error: "El archivo está vacío o excede el tamaño permitido." };
  }
  const existe = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { id: true },
  });
  if (!existe) return { ok: false, error: "La póliza no existe." };

  // Clave nueva en cada subida: nunca se sobrescribe un archivo existente.
  const clave = `${polizaId}/${crypto.randomUUID()}.${def.extension}`;
  try {
    const firmada = await getAlmacen().urlSubida(clave, def.mime, bytes);
    return { ok: true, clave, ...firmada };
  } catch (e) {
    console.error("[prepararSubida]", e);
    return { ok: false, error: "No se pudo preparar la subida del archivo." };
  }
}

/**
 * Paso 2: vincula a la póliza el archivo ya subido. Verifica en el almacenamiento que exista,
 * que su tamaño sea válido y que sus primeros bytes correspondan al tipo (no se confía en la
 * validación del navegador). Si la póliza tenía un archivo previo del mismo tipo, lo borra.
 */
export async function vincularArchivo(
  polizaId: string,
  tipo: TipoArchivo,
  path: string,
  nombreOriginal: string
): Promise<VincularArchivoResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION_EXPIRADA };
  if (
    typeof polizaId !== "string" ||
    typeof path !== "string" ||
    !esTipoArchivo(tipo) ||
    !rutaArchivoValida(polizaId, tipo, path)
  ) {
    return { ok: false, error: "Referencia de archivo inválida." };
  }

  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { caratula_path: true, negociacion_path: true, expediente_path: true },
  });
  if (!poliza) return { ok: false, error: "La póliza no existe." };
  const anterior = poliza[COLUMNAS_ARCHIVO[tipo].path];

  const almacen = getAlmacen();
  const def = ARCHIVOS[tipo];
  const info = await almacen.info(path);
  if (!info) return { ok: false, error: "No se encontró el archivo subido." };

  const inicio = await almacen.leerInicio(path, 4);
  const firmaValida = inicio !== null && def.firmas.some((f) => f.every((b, i) => inicio[i] === b));
  if (info.bytes <= 0 || info.bytes > def.maxBytes || !firmaValida) {
    await almacen.eliminar([path]).catch((e) => console.error("[vincularArchivo] limpieza", e));
    return { ok: false, error: `El archivo no es un ${def.extension.toUpperCase()} válido.` };
  }

  const nombre =
    String(nombreOriginal ?? "").replace(/[\\/\r\n"]/g, "_").trim().slice(0, 200) ||
    `${tipo}.${def.extension}`;

  await db.poliza.update({
    where: { id: polizaId, agenciaId: user.agenciaId },
    data: camposPoliza(tipo, { path, nombre, bytes: info.bytes, subido: new Date() }),
  });

  if (anterior && anterior !== path) {
    // Si falla, solo queda un archivo huérfano; la póliza ya apunta al nuevo.
    await almacen.eliminar([anterior]).catch((e) => console.error("[vincularArchivo] no se borró el anterior", e));
  }

  revalidatePath("/polizas");
  revalidatePath(`/polizas/${polizaId}`);
  return { ok: true, archivo: { nombre, bytes: info.bytes } };
}
