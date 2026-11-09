"use server";

import { revalidatePath } from "next/cache";

import { getAlmacen } from "@/lib/archivos/almacen";
import { alcanceDe, polizasDe } from "@/lib/auth/alcance";
import { getUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import {
  actualizarPoliza,
  registrarPoliza,
  type AgradecimientoRenovacion,
  type EditarPolizaResultado,
  type GuardarPolizaResultado,
} from "@/lib/polizas/guardar";
import { leerCco, MAX_CCO } from "@/lib/comunicaciones/correo";
import {
  enviarAgradecimientoRenovacion,
  enviarAvisoEndoso,
  enviarPolizaNueva,
  esRenovacion,
} from "@/lib/polizas/agradecimiento";
import { parseNumero, validarPrimaNeta } from "@/lib/polizas/validacion";

export async function guardarPoliza(raw: unknown): Promise<GuardarPolizaResultado> {
  // Las Server Actions son endpoints públicos: se valida la sesión aquí mismo.
  const user = await getUsuarioCrm();
  if (!user) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // Renovación: el formulario manda la póliza que se renueva.
  const renuevaA =
    typeof raw === "object" && raw !== null && "renuevaA" in raw ? (raw as { renuevaA: unknown }).renuevaA : undefined;
  const resultado = await registrarPoliza(raw, {
    permitirComision: veComisiones(user),
    usuario: user,
    leidaConIa: typeof raw === "object" && raw !== null && "origen" in raw && raw.origen === "ocr",
    ...(renuevaA !== undefined && { renuevaA: String(renuevaA) }),
  });
  if (!resultado.ok) return resultado;
  revalidatePath("/polizas", "layout");
  revalidatePath("/");
  return resultado;
}

/** Copia oculta escrita a mano en el diálogo de envío: solo correos válidos y como máximo MAX_CCO. */
function validarCco(texto: unknown): { ok: true; correos: string[] } | { ok: false; motivo: string } {
  if (typeof texto !== "string" || texto.length > 1000) return { ok: false, motivo: "la copia oculta no es válida." };
  const { correos, invalidos } = leerCco(texto);
  if (invalidos.length > 0) return { ok: false, motivo: `la copia oculta tiene un correo inválido (${invalidos[0]}).` };
  if (correos.length > MAX_CCO) return { ok: false, motivo: `la copia oculta admite como máximo ${MAX_CCO} correos.` };
  return { ok: true, correos };
}

/**
 * "Gracias por continuar con nosotros" al cliente de una renovación, con su carátula y su
 * expediente: el formulario lo pide al terminar de subir los archivos y el detalle de la póliza
 * tiene un botón para mandarlo después. Vale para las que se capturaron con "Renovar" y para las
 * que se sumaron solas a la cadena de la anterior; sale una sola vez por póliza. Un fallo no
 * deshace la renovación.
 */
export async function enviarAgradecimientoDeRenovacion(polizaId: string, cco = ""): Promise<AgradecimientoRenovacion> {
  const user = await getUsuarioCrm();
  if (!user) return { enviado: false, motivo: "tu sesión expiró." };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId)) return { enviado: false, motivo: "datos inválidos." };
  const ocultas = validarCco(cco);
  if (!ocultas.ok) return { enviado: false, motivo: ocultas.motivo };
  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { id: true, cadenaId: true, vigencia_inicio: true, canceladaAt: true },
  });
  if (!poliza) return { enviado: false, motivo: "la póliza ya no existe." };
  if (poliza.canceladaAt) return { enviado: false, motivo: "la póliza está cancelada." };
  if (!(await esRenovacion(poliza, user.agenciaId))) return { enviado: false, motivo: "la póliza no es una renovación." };
  const r = await enviarAgradecimientoRenovacion(polizaId, user.agenciaId, ocultas.correos).catch((e) => {
    console.error("[enviarAgradecimientoDeRenovacion]", e instanceof Error ? e.message : e);
    return { enviado: false as const, motivo: "no se pudo enviar el correo." };
  });
  if (r.enviado) revalidatePath(`/polizas/${polizaId}`);
  return r;
}

/**
 * "Tu nueva póliza ya está lista" al cliente de una póliza nueva (no renovación), con su carátula
 * y su expediente: botón "Nuevo" del detalle de la póliza. Sale una sola vez por póliza.
 */
export async function enviarPolizaNuevaAlCliente(polizaId: string, cco = ""): Promise<AgradecimientoRenovacion> {
  const user = await getUsuarioCrm();
  if (!user) return { enviado: false, motivo: "tu sesión expiró." };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId)) return { enviado: false, motivo: "datos inválidos." };
  const ocultas = validarCco(cco);
  if (!ocultas.ok) return { enviado: false, motivo: ocultas.motivo };
  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { id: true, cadenaId: true, vigencia_inicio: true, canceladaAt: true },
  });
  if (!poliza) return { enviado: false, motivo: "la póliza ya no existe." };
  if (poliza.canceladaAt) return { enviado: false, motivo: "la póliza está cancelada." };
  if (await esRenovacion(poliza, user.agenciaId)) return { enviado: false, motivo: "la póliza es una renovación." };
  const r = await enviarPolizaNueva(polizaId, user.agenciaId, ocultas.correos).catch((e) => {
    console.error("[enviarPolizaNuevaAlCliente]", e instanceof Error ? e.message : e);
    return { enviado: false as const, motivo: "no se pudo enviar el correo." };
  });
  if (r.enviado) revalidatePath(`/polizas/${polizaId}`);
  return r;
}

/**
 * "Se realizaron los cambios a tu póliza" al cliente, con la póliza actualizada (carátula y
 * expediente): botón "Endoso" del detalle de la póliza. Con `endosoId` describe ese endoso y sale
 * una vez por endoso; sin él, es un aviso general que se puede repetir.
 */
export async function enviarEndosoAlCliente(
  polizaId: string,
  endosoId: string | null,
  cco = ""
): Promise<AgradecimientoRenovacion> {
  const user = await getUsuarioCrm();
  if (!user) return { enviado: false, motivo: "tu sesión expiró." };
  const id = /^[a-z0-9]+$/i;
  if (typeof polizaId !== "string" || !id.test(polizaId) || (endosoId !== null && (typeof endosoId !== "string" || !id.test(endosoId)))) {
    return { enviado: false, motivo: "datos inválidos." };
  }
  const ocultas = validarCco(cco);
  if (!ocultas.ok) return { enviado: false, motivo: ocultas.motivo };
  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { id: true, canceladaAt: true },
  });
  if (!poliza) return { enviado: false, motivo: "la póliza ya no existe." };
  if (poliza.canceladaAt) return { enviado: false, motivo: "la póliza está cancelada." };
  const r = await enviarAvisoEndoso(polizaId, user.agenciaId, endosoId, ocultas.correos).catch((e) => {
    console.error("[enviarEndosoAlCliente]", e instanceof Error ? e.message : e);
    return { enviado: false as const, motivo: "no se pudo enviar el correo." };
  });
  if (r.enviado) revalidatePath(`/polizas/${polizaId}`);
  return r;
}

/** Corrige una póliza existente (ver actualizarPoliza). */
export async function editarPoliza(polizaId: string, raw: unknown): Promise<EditarPolizaResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const resultado = await actualizarPoliza(polizaId, raw, { permitirComision: veComisiones(user), usuario: user });
  if (resultado.ok) {
    revalidatePath("/polizas", "layout");
    revalidatePath("/clientes", "layout");
    revalidatePath("/");
    revalidatePath("/conciliacion");
  }
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
 * El cliente se conserva. Los archivos se listan mientras la póliza existe (las políticas de
 * Storage solo muestran archivos de pólizas vigentes de la agencia) y se borran después de la
 * base de datos: si fallara el almacenamiento solo quedarían archivos huérfanos, nunca una
 * póliza apuntando a archivos inexistentes.
 */
export async function eliminarPoliza(polizaId: string, confirmacion: string): Promise<EliminarPolizaResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId)) return { ok: false, error: "Datos inválidos." };

  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { numeroImpreso: true, cliente: { select: { nombre: true } }, _count: { select: { recibos: true } } },
  });
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };
  // La confirmación también se valida aquí: el navegador no es de fiar.
  if (typeof confirmacion !== "string" || confirmacion.trim().toUpperCase() !== poliza.numeroImpreso.toUpperCase()) {
    return { ok: false, error: "El número escrito no coincide con el de la póliza." };
  }

  const almacen = getAlmacen();
  let archivos: string[] | null = null;
  try {
    archivos = await almacen.listarCarpeta(`${polizaId}/`);
  } catch (e) {
    console.error("[eliminarPoliza] no se listaron los archivos", polizaId, e);
  }

  await db.$transaction(async (tx) => {
    await tx.poliza.delete({ where: { id: polizaId, agenciaId: user.agenciaId } });
    await registrarBitacora(
      user,
      {
        accion: "poliza.eliminar",
        entidad: "poliza",
        entidadId: polizaId,
        descripcion: `Eliminó la póliza ${poliza.numeroImpreso} de ${poliza.cliente.nombre} con ${poliza._count.recibos} recibos`,
      },
      tx
    );
  });

  let archivosBorrados = 0;
  let avisoAlmacen: string | undefined;
  try {
    if (!archivos) throw new Error("No se pudo listar la carpeta.");
    await almacen.eliminar(archivos);
    archivosBorrados = archivos.length;
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
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId) || typeof valor !== "string") {
    return { ok: false, error: "Datos inválidos." };
  }
  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { prima_total: true, prima_neta: true, numeroImpreso: true },
  });
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };

  const error = validarPrimaNeta(valor, Number(poliza.prima_total));
  if (error) return { ok: false, error };

  const nueva = parseNumero(valor).toFixed(2);
  await db.$transaction(async (tx) => {
    await tx.poliza.update({ where: { id: polizaId, agenciaId: user.agenciaId }, data: { prima_neta: nueva } });
    await registrarBitacora(
      user,
      {
        accion: "poliza.prima_neta",
        entidad: "poliza",
        entidadId: polizaId,
        descripcion: `Prima neta de la póliza ${poliza.numeroImpreso}: ${poliza.prima_neta === null ? "sin capturar" : `$${Number(poliza.prima_neta).toFixed(2)}`} → $${nueva}`,
      },
      tx
    );
  });
  // Cambia la comisión esperada del dashboard y de la conciliación.
  revalidatePath(`/polizas/${polizaId}`);
  revalidatePath("/");
  revalidatePath("/conciliacion");
  return { ok: true };
}
