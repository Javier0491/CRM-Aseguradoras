"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
 * esa agencia. Queda en la bitácora de la agencia a la que entra. Redirige al dashboard: la
 * página actual podría ser de un registro de la agencia anterior.
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
