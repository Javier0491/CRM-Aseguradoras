"use server";

import { revalidatePath } from "next/cache";

import { alcanceDe, clientesDe, polizasDe } from "@/lib/auth/alcance";
import { esAdmin, getAdmin, getUsuarioCrm, type UsuarioSesion } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import {
  esTipoPersona,
  esTipoSeguimiento,
  MAX_TEXTO_SEGUIMIENTO,
  RFC_GENERICOS,
  validarCliente,
  type ClienteValores,
  type ErroresCliente,
} from "@/lib/clientes/reglas";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import { normalizarRfc, normalizarTelefono } from "@/lib/polizas/validacion";
import { leerEjecutivoSolicitado, resolverEjecutivo } from "@/lib/usuarios/asignacion";

const SESION = "Tu sesión expiró. Vuelve a iniciar sesión.";
const ID = /^[a-z0-9]+$/i;

export type ClienteResultado = { ok: true } | { ok: false; error?: string; errores?: ErroresCliente };

async function clienteVisible(user: UsuarioSesion, id: unknown) {
  if (typeof id !== "string" || !ID.test(id)) return null;
  return db.cliente.findFirst({
    where: { AND: [{ id }, clientesDe(alcanceDe(user))] },
    select: {
      id: true,
      nombre: true,
      rfc: true,
      telefono: true,
      email: true,
      tipoPersona: true,
      fechaNacimiento: true,
      direccion: true,
      municipio: true,
      estado: true,
      codigoPostal: true,
      ejecutivoId: true,
    },
  });
}

const ETIQUETAS: Record<string, string> = {
  nombre: "nombre",
  rfc: "RFC",
  telefono: "teléfono",
  email: "correo",
  tipoPersona: "tipo de persona",
  fechaNacimiento: "fecha de nacimiento",
  direccion: "dirección",
  municipio: "municipio",
  estado: "estado",
  codigoPostal: "código postal",
  ejecutivoId: "ejecutivo",
};

/** Edita el expediente del cliente. Un RFC que ya tiene otro cliente se resuelve fusionándolos. */
export async function actualizarCliente(clienteId: string, raw: ClienteValores & { ejecutivoId?: string }): Promise<ClienteResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  const actual = await clienteVisible(user, clienteId);
  if (!actual) return { ok: false, error: "El cliente ya no existe." };
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Datos inválidos." };

  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const valores: ClienteValores = {
    nombre: texto(raw.nombre, 250),
    rfc: texto(raw.rfc, 20),
    telefono: texto(raw.telefono, 30),
    email: texto(raw.email, 260).toLowerCase(),
    tipoPersona: texto(raw.tipoPersona, 10),
    fechaNacimiento: texto(raw.fechaNacimiento, 10),
    direccion: texto(raw.direccion, 320),
    municipio: texto(raw.municipio, 130),
    estado: texto(raw.estado, 70),
    codigoPostal: texto(raw.codigoPostal, 10),
  };
  const errores = validarCliente(valores, hoyISO());
  if (Object.keys(errores).length > 0) return { ok: false, errores };
  const asignado = await resolverEjecutivo(user, leerEjecutivoSolicitado(raw), actual.ejecutivoId);
  if (!asignado.ok) return { ok: false, error: asignado.error };

  const rfc = normalizarRfc(valores.rfc);
  if (rfc !== actual.rfc && !RFC_GENERICOS.has(rfc)) {
    const otro = await db.cliente.findFirst({
      where: { agenciaId: user.agenciaId, rfc, id: { not: actual.id } },
      select: { nombre: true },
    });
    if (otro) {
      return {
        ok: false,
        errores: { rfc: `Ya existe otro cliente con este RFC (${otro.nombre}). Si es la misma persona, fusiónalos.` },
      };
    }
  }

  const nuevo = {
    nombre: valores.nombre,
    rfc,
    telefono: normalizarTelefono(valores.telefono),
    email: valores.email,
    tipoPersona: esTipoPersona(valores.tipoPersona) ? valores.tipoPersona : actual.tipoPersona,
    fechaNacimiento: valores.fechaNacimiento ? new Date(`${valores.fechaNacimiento}T00:00:00Z`) : null,
    direccion: valores.direccion || null,
    municipio: valores.municipio || null,
    estado: valores.estado || null,
    codigoPostal: valores.codigoPostal || null,
    ejecutivoId: asignado.ejecutivoId,
  };
  const comparable = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? ""));
  const cambios = Object.keys(ETIQUETAS).filter(
    (k) => comparable(actual[k as keyof typeof actual]) !== comparable(nuevo[k as keyof typeof nuevo])
  );
  if (cambios.length === 0) return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.cliente.update({ where: { id: actual.id, agenciaId: user.agenciaId }, data: nuevo });
    await registrarBitacora(
      user,
      {
        accion: "cliente.editar",
        entidad: "cliente",
        entidadId: actual.id,
        descripcion: `Editó el cliente ${nuevo.nombre}: ${cambios.map((k) => ETIQUETAS[k]).join(", ")}`,
      },
      tx
    );
  });
  revalidatePath(`/clientes/${actual.id}`);
  revalidatePath("/clientes");
  revalidatePath("/polizas", "layout");
  return { ok: true };
}

export type NotaResultado = { ok: true } | { ok: false; error: string };

/** Agrega una nota, llamada, mensaje o reunión al seguimiento del cliente (opcionalmente sobre una de sus pólizas). */
export async function agregarSeguimiento(
  clienteId: string,
  datos: { tipo: string; texto: string; polizaId?: string }
): Promise<NotaResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  const cliente = await clienteVisible(user, clienteId);
  if (!cliente) return { ok: false, error: "El cliente ya no existe." };
  if (typeof datos !== "object" || datos === null || !esTipoSeguimiento(datos.tipo)) {
    return { ok: false, error: "Elige el tipo de registro." };
  }
  const texto = typeof datos.texto === "string" ? datos.texto.trim() : "";
  if (!texto) return { ok: false, error: "Escribe la nota." };
  if (texto.length > MAX_TEXTO_SEGUIMIENTO) return { ok: false, error: `Máximo ${MAX_TEXTO_SEGUIMIENTO} caracteres.` };

  let polizaId: string | null = null;
  if (datos.polizaId) {
    if (!ID.test(datos.polizaId)) return { ok: false, error: "Póliza inválida." };
    const poliza = await db.poliza.findFirst({
      where: { id: datos.polizaId, cliente_id: cliente.id, ...polizasDe(alcanceDe(user)) },
      select: { id: true },
    });
    if (!poliza) return { ok: false, error: "La póliza no es de este cliente." };
    polizaId = poliza.id;
  }

  await db.notaCliente.create({
    data: {
      agenciaId: user.agenciaId,
      clienteId: cliente.id,
      polizaId,
      tipo: datos.tipo,
      texto,
      usuarioId: user.id,
      usuarioEmail: user.email,
    },
  });
  revalidatePath(`/clientes/${cliente.id}`);
  return { ok: true };
}

/** Borra un registro del seguimiento: solo su autor o un administrador. */
export async function eliminarSeguimiento(notaId: string): Promise<NotaResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  if (typeof notaId !== "string" || !ID.test(notaId)) return { ok: false, error: "Datos inválidos." };
  const nota = await db.notaCliente.findFirst({
    where: { id: notaId, agenciaId: user.agenciaId, cliente: clientesDe(alcanceDe(user)) },
    select: { id: true, clienteId: true, usuarioId: true },
  });
  if (!nota) return { ok: false, error: "La nota ya no existe." };
  if (nota.usuarioId !== user.id && !esAdmin(user)) return { ok: false, error: "Solo su autor o un administrador la puede borrar." };
  await db.notaCliente.delete({ where: { id: nota.id } });
  revalidatePath(`/clientes/${nota.clienteId}`);
  return { ok: true };
}

export type FusionResultado = { ok: true; polizas: number } | { ok: false; error: string };

/**
 * ADMIN: fusiona `origenId` en `destinoId` (el mismo cliente capturado dos veces). Pasan al
 * destino las pólizas, el seguimiento y las tareas del origen; el destino completa con los datos
 * del origen los que no tenía (teléfono, correo, dirección…). El origen se borra.
 */
export async function fusionarClientes(destinoId: string, origenId: string): Promise<FusionResultado> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede fusionar clientes." };
  if (typeof destinoId !== "string" || typeof origenId !== "string" || !ID.test(destinoId) || !ID.test(origenId) || destinoId === origenId) {
    return { ok: false, error: "Datos inválidos." };
  }
  const [destino, origen] = await Promise.all([clienteVisible(admin, destinoId), clienteVisible(admin, origenId)]);
  if (!destino || !origen) return { ok: false, error: "Uno de los clientes ya no existe; recarga la página." };

  const completar = {
    ...(!destino.telefono && origen.telefono && { telefono: origen.telefono }),
    ...(!destino.email && origen.email && { email: origen.email }),
    ...(!destino.fechaNacimiento && origen.fechaNacimiento && { fechaNacimiento: origen.fechaNacimiento }),
    ...(!destino.direccion && origen.direccion && { direccion: origen.direccion }),
    ...(!destino.municipio && origen.municipio && { municipio: origen.municipio }),
    ...(!destino.estado && origen.estado && { estado: origen.estado }),
    ...(!destino.codigoPostal && origen.codigoPostal && { codigoPostal: origen.codigoPostal }),
    ...(!destino.ejecutivoId && origen.ejecutivoId && { ejecutivoId: origen.ejecutivoId }),
  };

  const polizas = await db.$transaction(async (tx) => {
    const { count } = await tx.poliza.updateMany({
      where: { agenciaId: admin.agenciaId, cliente_id: origen.id },
      data: { cliente_id: destino.id },
    });
    await tx.notaCliente.updateMany({ where: { agenciaId: admin.agenciaId, clienteId: origen.id }, data: { clienteId: destino.id } });
    await tx.tarea.updateMany({ where: { agenciaId: admin.agenciaId, clienteId: origen.id }, data: { clienteId: destino.id } });
    if (Object.keys(completar).length > 0) {
      await tx.cliente.update({ where: { id: destino.id, agenciaId: admin.agenciaId }, data: completar });
    }
    await tx.cliente.delete({ where: { id: origen.id, agenciaId: admin.agenciaId } });
    await registrarBitacora(
      admin,
      {
        accion: "cliente.fusionar",
        entidad: "cliente",
        entidadId: destino.id,
        descripcion:
          `Fusionó el cliente ${origen.nombre} (${origen.rfc}) en ${destino.nombre} (${destino.rfc}); ` +
          `${count} ${count === 1 ? "póliza pasó" : "pólizas pasaron"} al cliente que se conserva`,
        datos: { origen: { id: origen.id, nombre: origen.nombre, rfc: origen.rfc } },
      },
      tx
    );
    return count;
  });
  revalidatePath("/clientes", "layout");
  revalidatePath("/polizas", "layout");
  return { ok: true, polizas };
}
