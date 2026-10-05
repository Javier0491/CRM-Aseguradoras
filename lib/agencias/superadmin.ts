"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { COLOR_MARCA_PREDETERMINADO, TEMA_PREDETERMINADO } from "@/lib/agencias/marca";
import { escribirAgenciaEnAuth } from "@/lib/agencias/sesion";
import { getCurrentUser } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CambioAgenciaResultado = { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SUPERADMIN: pasa a operar otra agencia. Guarda la agencia activa en su perfil, la escribe en
 * el claim app_metadata.agencia_id del JWT y refresca la sesión, así que desde la siguiente
 * solicitud las consultas, las políticas RLS, Storage y la marca (logo, color y tema) son los de
 * esa agencia. Queda en la bitácora de la agencia a la que entra. Redirige al dashboard de la
 * agencia. Lo usa el panel de agencias (/superadmin).
 */
export async function cambiarAgenciaActiva(agenciaId: string): Promise<CambioAgenciaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof agenciaId !== "string" || !UUID.test(agenciaId)) return { ok: false, error: "Agencia inválida." };

  // El rol se verifica en la base de datos, nunca en el token.
  const perfil = await db.usuario.findUnique({
    where: { id: user.id },
    select: { rolSistema: true, agenciaId: true },
  });
  if (perfil?.rolSistema !== "SUPERADMIN") return { ok: false, error: "Solo un superadministrador puede cambiar de agencia." };
  const destino = await db.agencia.findUnique({ where: { id: agenciaId }, select: { id: true, nombre: true } });
  if (!destino) return { ok: false, error: "La agencia ya no existe." };

  if (destino.id !== user.agenciaId) {
    const activaAnterior = user.agenciaId === perfil.agenciaId ? null : user.agenciaId;
    // Volver a la propia deja agenciaActivaId en null.
    await db.usuario.update({
      where: { id: user.id },
      data: { agenciaActivaId: destino.id === perfil.agenciaId ? null : destino.id },
    });
    if (!(await escribirAgenciaEnAuth(user.id, destino.id))) {
      // Sin el claim nuevo la base de datos y el JWT no coincidirían: se deshace.
      await db.usuario.update({ where: { id: user.id }, data: { agenciaActivaId: activaAnterior } });
      return { ok: false, error: "No se pudo actualizar la sesión (falta SUPABASE_SECRET_KEY o falló Supabase Auth)." };
    }
    // Token nuevo con el claim ya actualizado (lo usan RLS y Storage).
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      console.error("[cambiarAgenciaActiva] refreshSession", error.message);
      return { ok: false, error: "Se cambió la agencia, pero no se pudo renovar la sesión: vuelve a iniciar sesión." };
    }
    await registrarBitacora(
      { id: user.id, email: user.email, agenciaId: destino.id },
      {
        accion: "agencia.entrar_superadmin",
        entidad: "agencia",
        entidadId: destino.id,
        descripcion: `${user.email ?? "Superadmin"} entró a ${destino.nombre} como superadministrador`,
      }
    );
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export type CrearAgenciaState = { ok?: boolean; error?: string; agencia?: { id: string; nombre: string } };

/**
 * SUPERADMIN: da de alta una agencia (un CRM nuevo) con la marca predeterminada. Nace vacía: sin
 * usuarios, aseguradoras ni matriz de comisiones; el superadmin entra a ella para configurarla y
 * crear a su primer administrador. Queda en la bitácora de la agencia nueva.
 */
export async function crearAgencia(_prev: CrearAgenciaState, formData: FormData): Promise<CrearAgenciaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const perfil = await db.usuario.findUnique({ where: { id: user.id }, select: { rolSistema: true } });
  if (perfil?.rolSistema !== "SUPERADMIN") return { error: "Solo un superadministrador puede crear agencias." };

  const nombre = String(formData.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 2 || nombre.length > 80) return { error: "Escribe el nombre (entre 2 y 80 caracteres)." };
  const repetida = await db.agencia.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" } },
    select: { id: true },
  });
  if (repetida) return { error: `Ya existe una agencia llamada ${nombre}.` };

  const agencia = await db.$transaction(async (tx) => {
    const creada = await tx.agencia.create({
      data: { nombre, colorHex: COLOR_MARCA_PREDETERMINADO, tema: TEMA_PREDETERMINADO },
      select: { id: true, nombre: true },
    });
    await registrarBitacora(
      { id: user.id, email: user.email, agenciaId: creada.id },
      {
        accion: "agencia.crear",
        entidad: "agencia",
        entidadId: creada.id,
        descripcion: `${user.email ?? "Superadmin"} creó la agencia ${creada.nombre}`,
      },
      tx
    );
    return creada;
  });

  revalidatePath("/superadmin");
  return { ok: true, agencia };
}

export type SuspensionResultado = { ok: true } | { ok: false; error: string };

/**
 * SUPERADMIN: suspende una agencia (p. ej. por falta de pago) o la reactiva. Suspendida, ninguno
 * de sus usuarios puede entrar (las sesiones abiertas se cortan en la siguiente solicitud) y no
 * salen sus avisos automáticos; sus datos no se tocan. El superadmin puede seguir entrando a ella.
 * Su propia agencia no se puede suspender. Queda en la bitácora de la agencia.
 */
export async function cambiarSuspensionAgencia(
  agenciaId: string,
  suspender: boolean,
  motivo?: string
): Promise<SuspensionResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof agenciaId !== "string" || !UUID.test(agenciaId)) return { ok: false, error: "Agencia inválida." };
  const perfil = await db.usuario.findUnique({ where: { id: user.id }, select: { rolSistema: true, agenciaId: true } });
  if (perfil?.rolSistema !== "SUPERADMIN") return { ok: false, error: "Solo un superadministrador puede suspender agencias." };
  if (suspender && agenciaId === perfil.agenciaId) return { ok: false, error: "No puedes suspender tu propia agencia." };

  const agencia = await db.agencia.findUnique({ where: { id: agenciaId }, select: { nombre: true, suspendida: true } });
  if (!agencia) return { ok: false, error: "La agencia ya no existe." };
  const nota = suspender ? String(motivo ?? "").trim().replace(/\s+/g, " ").slice(0, 200) || null : null;

  if (agencia.suspendida !== suspender) {
    await db.$transaction(async (tx) => {
      await tx.agencia.update({
        where: { id: agenciaId },
        data: { suspendida: suspender, suspendidaAt: suspender ? new Date() : null, motivoSuspension: nota },
      });
      await registrarBitacora(
        { id: user.id, email: user.email, agenciaId },
        {
          accion: suspender ? "agencia.suspender" : "agencia.reactivar",
          entidad: "agencia",
          entidadId: agenciaId,
          descripcion: suspender
            ? `${user.email ?? "Superadmin"} suspendió la agencia ${agencia.nombre}${nota ? ` (${nota})` : ""}`
            : `${user.email ?? "Superadmin"} reactivó la agencia ${agencia.nombre}`,
        },
        tx
      );
    });
  }

  revalidatePath("/superadmin");
  revalidatePath("/", "layout");
  return { ok: true };
}
