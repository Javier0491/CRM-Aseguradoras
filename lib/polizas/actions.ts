"use server";

import { revalidatePath } from "next/cache";

import { getAlmacen } from "@/lib/archivos/almacen";
import { esAdmin, getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { registrarPoliza, type GuardarPolizaResultado } from "@/lib/polizas/guardar";
import { parseNumero, validarPrimaNeta } from "@/lib/polizas/validacion";

export async function guardarPoliza(raw: unknown): Promise<GuardarPolizaResultado> {
  // Las Server Actions son endpoints públicos: se valida la sesión aquí mismo.
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const resultado = await registrarPoliza(raw, { permitirComision: esAdmin(user) });
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

export type ActualizarPrimaNetaResultado = { ok: true } | { ok: false; error: string };

/**
 * Captura o corrige la prima neta de una póliza (base de la comisión esperada). Sirve sobre
 * todo para las pólizas registradas antes de que existiera el campo.
 */
export async function actualizarPrimaNeta(polizaId: string, valor: string): Promise<ActualizarPrimaNetaResultado> {
  if (!(await getCurrentUser())) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId) || typeof valor !== "string") {
    return { ok: false, error: "Datos inválidos." };
  }
  const poliza = await db.poliza.findUnique({ where: { id: polizaId }, select: { prima_total: true } });
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };

  const error = validarPrimaNeta(valor, Number(poliza.prima_total));
  if (error) return { ok: false, error };

  await db.poliza.update({ where: { id: polizaId }, data: { prima_neta: parseNumero(valor).toFixed(2) } });
  // Cambia la comisión esperada del dashboard y de la conciliación.
  revalidatePath(`/polizas/${polizaId}`);
  revalidatePath("/");
  revalidatePath("/conciliacion");
  return { ok: true };
}
