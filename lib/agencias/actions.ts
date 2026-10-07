"use server";

import { revalidatePath } from "next/cache";

import { eliminarLogo, LogoError, subirLogo } from "@/lib/agencias/logos";
import { esTema, TEMAS } from "@/lib/agencias/marca";
import { normalizarSlug, slugValido } from "@/lib/agencias/slug";
import { getAdmin, getCurrentUser } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { normalizarHex } from "@/lib/color";
import { db } from "@/lib/db";

export type AgenciaFormState = {
  ok?: boolean;
  error?: string;
  errores?: Partial<Record<"nombre" | "colorHex" | "logo" | "logoDocumentos" | "tema", string>>;
};

/**
 * Actualiza el nombre, el color de marca, el tema y el logo de la agencia del administrador. La
 * agencia sale siempre de la sesión: el formulario no manda (ni podría cambiar) el id.
 * Campos: nombre, colorHex, tema ("dark" | "light"), logo (ícono de la barra lateral, archivo
 * opcional) y quitarLogo ("1" para volver al monograma); logoDocumentos y quitarLogoDocumentos
 * hacen lo mismo con el logo de documentos y correos.
 */
export async function actualizarAgencia(_prev: AgenciaFormState, formData: FormData): Promise<AgenciaFormState> {
  const admin = await getAdmin();
  if (!admin) {
    return {
      error: (await getCurrentUser())
        ? "Solo un administrador puede cambiar los datos de la agencia."
        : "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }
  const { agenciaId } = admin;

  const nombre = String(formData.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  const colorHex = normalizarHex(String(formData.get("colorHex") ?? ""));
  const tema = formData.get("tema");
  const logo = formData.get("logo");
  const archivo = logo instanceof File && logo.size > 0 ? logo : null;
  const quitarLogo = formData.get("quitarLogo") === "1";
  const logoDoc = formData.get("logoDocumentos");
  const archivoDoc = logoDoc instanceof File && logoDoc.size > 0 ? logoDoc : null;
  const quitarLogoDoc = formData.get("quitarLogoDocumentos") === "1";

  const errores: AgenciaFormState["errores"] = {};
  if (nombre.length < 2 || nombre.length > 80) errores.nombre = "Escribe el nombre (entre 2 y 80 caracteres).";
  if (!colorHex) errores.colorHex = "Elige un color válido (#RRGGBB).";
  if (!esTema(tema)) errores.tema = "Elige el modo oscuro o el claro.";
  if (Object.keys(errores).length > 0 || !esTema(tema)) return { errores };

  const actual = await db.agencia.findUniqueOrThrow({
    where: { id: agenciaId },
    select: { nombre: true, colorHex: true, tema: true, logoUrl: true, logoDocumentosUrl: true },
  });

  let logoUrl = quitarLogo ? null : actual.logoUrl;
  if (archivo) {
    try {
      logoUrl = await subirLogo(agenciaId, archivo);
    } catch (e) {
      if (e instanceof LogoError) return { errores: { logo: e.message } };
      console.error("[actualizarAgencia] logo", e);
      return { error: "No se pudo guardar el logo." };
    }
  }
  let logoDocumentosUrl = quitarLogoDoc ? null : actual.logoDocumentosUrl;
  if (archivoDoc) {
    try {
      logoDocumentosUrl = await subirLogo(agenciaId, archivoDoc);
    } catch (e) {
      // El ícono recién subido quedaría huérfano: nada apunta a él.
      if (archivo) await eliminarLogo(agenciaId, logoUrl);
      if (e instanceof LogoError) return { errores: { logoDocumentos: e.message } };
      console.error("[actualizarAgencia] logo de documentos", e);
      return { error: "No se pudo guardar el logo." };
    }
  }

  const cambios = [
    actual.nombre !== nombre && `nombre «${actual.nombre}» → «${nombre}»`,
    actual.colorHex !== colorHex && `color ${actual.colorHex ?? "predeterminado"} → ${colorHex}`,
    actual.tema !== tema && `tema → ${TEMAS.find((t) => t.value === tema)?.label.toLowerCase()}`,
    actual.logoUrl !== logoUrl && (logoUrl ? "ícono nuevo" : "quitó el ícono"),
    actual.logoDocumentosUrl !== logoDocumentosUrl &&
      (logoDocumentosUrl ? "logo de documentos nuevo" : "quitó el logo de documentos"),
  ].filter((c): c is string => Boolean(c));

  if (cambios.length > 0) {
    try {
      await db.$transaction(async (tx) => {
        await tx.agencia.update({ where: { id: agenciaId }, data: { nombre, colorHex, tema, logoUrl, logoDocumentosUrl } });
        await registrarBitacora(
          admin,
          { accion: "agencia.editar", entidad: "agencia", entidadId: agenciaId, descripcion: cambios.join(", ") },
          tx
        );
      });
    } catch (e) {
      console.error("[actualizarAgencia]", e);
      // Los logos recién subidos quedarían huérfanos: nada apunta a ellos.
      if (archivo) await eliminarLogo(agenciaId, logoUrl);
      if (archivoDoc) await eliminarLogo(agenciaId, logoDocumentosUrl);
      return { error: "No se pudieron guardar los cambios. Intenta de nuevo." };
    }
    if (actual.logoUrl !== logoUrl) await eliminarLogo(agenciaId, actual.logoUrl);
    if (actual.logoDocumentosUrl !== logoDocumentosUrl) await eliminarLogo(agenciaId, actual.logoDocumentosUrl);
  }

  // El logo y el color se ven en todo el dashboard.
  revalidatePath("/", "layout");
  return { ok: true };
}

export type AjustesAgenciaState = {
  ok?: boolean;
  error?: string;
  errores?: Partial<Record<"slug" | "correoServicio", string>>;
};

const EMAIL_VALIDO = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

/**
 * Ajustes de operación de la agencia del administrador: la liga de acceso con su marca
 * (/login?agencia=<slug>), si cada ejecutivo ve solo su cartera y el correo de servicio que
 * aparece en los correos a clientes.
 * Campos: slug, carteraPorEjecutivo ("1" activa) y correoServicio (vacío = sin él).
 */
export async function actualizarAjustesAgencia(_prev: AjustesAgenciaState, formData: FormData): Promise<AjustesAgenciaState> {
  const admin = await getAdmin();
  if (!admin) {
    return {
      error: (await getCurrentUser())
        ? "Solo un administrador puede cambiar los ajustes de la agencia."
        : "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }
  const { agenciaId } = admin;
  const slug = normalizarSlug(String(formData.get("slug") ?? ""));
  const carteraPorEjecutivo = formData.get("carteraPorEjecutivo") === "1";
  const correoServicio = String(formData.get("correoServicio") ?? "").trim().toLowerCase() || null;
  if (!slugValido(slug)) return { errores: { slug: "Usa de 2 a 60 letras, números o guiones." } };
  if (correoServicio && (correoServicio.length > 254 || !EMAIL_VALIDO.test(correoServicio))) {
    return { errores: { correoServicio: "Escribe un correo válido o déjalo en blanco." } };
  }

  const actual = await db.agencia.findUniqueOrThrow({
    where: { id: agenciaId },
    select: { slug: true, carteraPorEjecutivo: true, correoServicio: true },
  });
  if (slug !== actual.slug) {
    const ocupado = await db.agencia.findUnique({ where: { slug }, select: { id: true } });
    if (ocupado) return { errores: { slug: "Esa liga ya la usa otra agencia; elige otra." } };
  }
  const cambios = [
    slug !== actual.slug && `liga de acceso «${actual.slug}» → «${slug}»`,
    carteraPorEjecutivo !== actual.carteraPorEjecutivo &&
      (carteraPorEjecutivo ? "cada ejecutivo ve solo su cartera" : "los ejecutivos ven toda la cartera"),
    correoServicio !== actual.correoServicio && `correo de servicio → ${correoServicio ?? "sin correo"}`,
  ].filter((c): c is string => Boolean(c));
  if (cambios.length === 0) return { ok: true };

  try {
    await db.$transaction(async (tx) => {
      await tx.agencia.update({ where: { id: agenciaId }, data: { slug, carteraPorEjecutivo, correoServicio } });
      await registrarBitacora(
        admin,
        { accion: "agencia.editar", entidad: "agencia", entidadId: agenciaId, descripcion: cambios.join(", ") },
        tx
      );
    });
  } catch (e) {
    console.error("[actualizarAjustesAgencia]", e);
    return { error: "No se pudieron guardar los ajustes. Intenta de nuevo." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
