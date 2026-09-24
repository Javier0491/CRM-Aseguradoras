"use server";

import { revalidatePath } from "next/cache";

import { ARCHIVOS_BUCKET, esTipoArchivo, rutaArchivoValida, type TipoArchivo } from "@/lib/archivos/config";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VincularArchivoResultado =
  | { ok: true; archivo: { nombre: string; bytes: number } }
  | { ok: false; error: string };

type Referencia = { path: string; nombre: string; bytes: number; subido: Date };

function camposPoliza(tipo: TipoArchivo, r: Referencia): Prisma.PolizaUpdateInput {
  return tipo === "caratula"
    ? { caratula_path: r.path, caratula_nombre: r.nombre, caratula_bytes: r.bytes, caratula_subido_at: r.subido }
    : { expediente_path: r.path, expediente_nombre: r.nombre, expediente_bytes: r.bytes, expediente_subido_at: r.subido };
}

/**
 * Vincula a la póliza un archivo que el navegador ya subió a Storage.
 * Verifica que el objeto exista (su tamaño se toma de Storage, no del cliente)
 * y, si la póliza tenía un archivo previo del mismo tipo, lo elimina.
 */
export async function vincularArchivo(
  polizaId: string,
  tipo: TipoArchivo,
  path: string,
  nombreOriginal: string
): Promise<VincularArchivoResultado> {
  // Las Server Actions son endpoints públicos: se valida la sesión aquí mismo.
  if (!(await getCurrentUser())) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }
  if (
    typeof polizaId !== "string" ||
    typeof path !== "string" ||
    !esTipoArchivo(tipo) ||
    !rutaArchivoValida(polizaId, tipo, path)
  ) {
    return { ok: false, error: "Referencia de archivo inválida." };
  }

  const poliza = await db.poliza.findUnique({
    where: { id: polizaId },
    select: { caratula_path: true, expediente_path: true },
  });
  if (!poliza) return { ok: false, error: "La póliza no existe." };
  const anterior = tipo === "caratula" ? poliza.caratula_path : poliza.expediente_path;

  const supabase = await createSupabaseServerClient();
  const storage = supabase.storage.from(ARCHIVOS_BUCKET);
  const { data: info, error } = await storage.info(path);
  if (error || !info) return { ok: false, error: "No se encontró el archivo subido." };

  const nombre =
    String(nombreOriginal ?? "").replace(/[\\/\r\n"]/g, "_").trim().slice(0, 200) ||
    `${tipo}.${path.split(".").pop()}`;
  const bytes = info.size ?? 0;

  await db.poliza.update({
    where: { id: polizaId },
    data: camposPoliza(tipo, { path, nombre, bytes, subido: new Date() }),
  });

  if (anterior && anterior !== path) {
    // Si falla, solo queda un archivo huérfano; la póliza ya apunta al nuevo.
    const { error: errorBorrado } = await storage.remove([anterior]);
    if (errorBorrado) console.error("[vincularArchivo] no se borró el anterior", errorBorrado);
  }

  revalidatePath("/polizas");
  revalidatePath(`/polizas/${polizaId}`);
  return { ok: true, archivo: { nombre, bytes } };
}
