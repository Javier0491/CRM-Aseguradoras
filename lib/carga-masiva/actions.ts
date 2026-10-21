"use server";

import { revalidatePath } from "next/cache";

import { getAdmin, veComisiones } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { validarContacto } from "@/lib/clientes/reglas";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import { registrarPoliza, type GuardarPolizaResultado } from "@/lib/polizas/guardar";
import { normalizarTelefono } from "@/lib/polizas/validacion";

const SESION = "Tu sesión expiró o no tienes permiso para la carga masiva.";
const ID = /^[a-z0-9]+$/i;

/**
 * Guarda una póliza leída en la carga masiva (solo administradores), igual que la captura normal.
 * Los recibos que ya vencieron al cargarla no generan el aviso automático de "recibo vencido": la
 * cartera que se sube puede estar pagada en la aseguradora y el cliente recibiría un cobro que no
 * debe. Se marcan como avisados en `avisos_enviados` con un destinatario que lo explica.
 */
export async function guardarPolizaMasiva(raw: unknown): Promise<GuardarPolizaResultado> {
  const user = await getAdmin();
  if (!user) return { ok: false, error: SESION };
  const resultado = await registrarPoliza(raw, { permitirComision: veComisiones(user), usuario: user, leidaConIa: true });
  if (!resultado.ok) return resultado;

  const vencidos = await db.recibo.findMany({
    where: { agenciaId: user.agenciaId, poliza_id: resultado.poliza.id, fecha_vencimiento: { lt: new Date(`${hoyISO()}T00:00:00Z`) } },
    select: { id: true },
  });
  if (vencidos.length > 0) {
    await db.avisoEnviado.createMany({
      data: vencidos.map((r) => ({
        agenciaId: user.agenciaId,
        tipo: "vencido",
        referencia_id: r.id,
        destinatario: "(no se envía: recibo ya vencido al cargarlo en la carga masiva)",
      })),
      skipDuplicates: true,
    });
  }
  return resultado;
}

/** Al terminar (o pausar) la carga: actualiza listados y tableros una sola vez. */
export async function terminarCargaMasiva() {
  if (!(await getAdmin())) return;
  revalidatePath("/polizas", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/");
}

export type ContactoCargado = {
  id: string;
  nombre: string;
  rfc: string;
  telefono: string;
  email: string;
  polizas: number;
};

/** Contacto de los clientes de las pólizas que se cargaron, para completar los que falten. */
export async function contactosDeClientes(ids: unknown): Promise<ContactoCargado[]> {
  const user = await getAdmin();
  if (!user || !Array.isArray(ids)) return [];
  const validos = [...new Set(ids.filter((id): id is string => typeof id === "string" && ID.test(id)))].slice(0, 5_000);
  if (validos.length === 0) return [];
  const clientes = await db.cliente.findMany({
    where: { agenciaId: user.agenciaId, id: { in: validos } },
    select: { id: true, nombre: true, rfc: true, telefono: true, email: true, _count: { select: { polizas: true } } },
    orderBy: { nombre: "asc" },
  });
  return clientes.map(({ _count, ...c }) => ({ ...c, polizas: _count.polizas }));
}

export type ContactoResultado =
  | { ok: true; telefono: string; email: string }
  | { ok: false; error?: string; errores?: { telefono?: string; email?: string } };

/**
 * Teléfono y correo de un cliente. Se guardan en su expediente, así que valen para todas sus
 * pólizas a la vez (las que ya tenía y las que se carguen después).
 */
export async function guardarContactoCliente(clienteId: unknown, raw: unknown): Promise<ContactoResultado> {
  const user = await getAdmin();
  if (!user) return { ok: false, error: SESION };
  if (typeof clienteId !== "string" || !ID.test(clienteId) || typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Datos inválidos." };
  }
  const leer = (k: string, max: number) => {
    const v = (raw as Record<string, unknown>)[k];
    return typeof v === "string" ? v.trim().slice(0, max) : "";
  };
  const valores = { telefono: leer("telefono", 30), email: leer("email", 260).toLowerCase() };
  const errores = validarContacto(valores);
  if (Object.keys(errores).length > 0) return { ok: false, errores };

  const cliente = await db.cliente.findFirst({
    where: { id: clienteId, agenciaId: user.agenciaId },
    select: { id: true, nombre: true, telefono: true, email: true },
  });
  if (!cliente) return { ok: false, error: "El cliente ya no existe." };
  const nuevo = { telefono: normalizarTelefono(valores.telefono), email: valores.email };
  if (nuevo.telefono === cliente.telefono && nuevo.email === cliente.email) return { ok: true, ...nuevo };

  await db.$transaction(async (tx) => {
    await tx.cliente.update({ where: { id: cliente.id, agenciaId: user.agenciaId }, data: nuevo });
    await registrarBitacora(
      user,
      {
        accion: "cliente.editar",
        entidad: "cliente",
        entidadId: cliente.id,
        descripcion: `Completó el contacto de ${cliente.nombre} desde la carga masiva`,
      },
      tx
    );
  });
  revalidatePath(`/clientes/${cliente.id}`);
  return { ok: true, ...nuevo };
}
