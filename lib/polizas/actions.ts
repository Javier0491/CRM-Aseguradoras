"use server";

import { revalidatePath } from "next/cache";

import { getAlmacen } from "@/lib/archivos/almacen";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { registrarPoliza, type GuardarPolizaResultado } from "@/lib/polizas/guardar";

export async function guardarPoliza(raw: unknown): Promise<GuardarPolizaResultado> {
  // Las Server Actions son endpoints públicos: se valida la sesión aquí mismo.
  if (!(await getCurrentUser())) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const resultado = await registrarPoliza(raw);
  if (resultado.ok) revalidatePath("/polizas");
  return resultado;
}

export type EliminarPolizaResultado =
  | {
      ok: true;
      archivosBorrados: number;
      /** La póliza se borró pero sus archivos no; quedan huérfanos en el almacenamiento. */
      avisoAlmacen?: string;
    }
  | { ok: false; error: string };

/**
 * Borra la póliza con sus recibos y asegurados (en cascada) y la carpeta completa de sus
 * archivos en el almacenamiento (R2 o Supabase), incluidos huérfanos de subidas fallidas.
 * El cliente se conserva. Primero la base de datos: si luego fallara el almacenamiento solo
 * quedarían archivos huérfanos, nunca una póliza apuntando a archivos inexistentes.
 */
export async function eliminarPoliza(polizaId: string, confirmacion: string): Promise<EliminarPolizaResultado> {
  if (!(await getCurrentUser())) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId)) return { ok: false, error: "Datos inválidos." };

  const poliza = await db.poliza.findUnique({ where: { id: polizaId }, select: { numeroImpreso: true } });
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };
  // La confirmación también se valida aquí: el navegador no es de fiar.
  if (typeof confirmacion !== "string" || confirmacion.trim().toUpperCase() !== poliza.numeroImpreso.toUpperCase()) {
    return { ok: false, error: "El número escrito no coincide con el de la póliza." };
  }

  await db.poliza.delete({ where: { id: polizaId } });

  let archivosBorrados = 0;
  let avisoAlmacen: string | undefined;
  try {
    archivosBorrados = await getAlmacen().eliminarCarpeta(`${polizaId}/`);
  } catch (e) {
    console.error("[eliminarPoliza] no se borraron los archivos", polizaId, e);
    avisoAlmacen = "La póliza se eliminó, pero no se pudieron borrar sus archivos del almacenamiento.";
  }

  revalidatePath("/polizas");
  revalidatePath("/");
  return { ok: true, archivosBorrados, avisoAlmacen };
}
