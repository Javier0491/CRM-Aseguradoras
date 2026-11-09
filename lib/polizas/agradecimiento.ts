import "server-only";

import type { Attachment } from "resend";

import { ramoLabel } from "@/components/polizas/poliza-ui";
import { getAlmacen } from "@/lib/archivos/almacen";
import { COLOR_MARCA_PREDETERMINADO, logoParaDocumentos } from "@/lib/agencias/marca";
import { mensajeAgradecimientoRenovacion, mensajePolizaNueva } from "@/lib/avisos/mensajes";
import { CorreoNoConfiguradoError, emailValido, enviarAviso, getConfigCorreo } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { Prisma } from "@/lib/generated/prisma/client";
import type { AgradecimientoRenovacion } from "@/lib/polizas/guardar";

/**
 * Correos que le entregan al cliente su póliza: el agradecimiento de una renovación o el aviso de
 * que su póliza nueva ya está lista. Cada uno sale una sola vez por póliza.
 */
export type ClaseCorreoPoliza = "renovacion" | "nueva";

const CLASES = {
  renovacion: { tipo: "agradecimiento_renovacion", mensaje: mensajeAgradecimientoRenovacion, modulo: "renovaciones" },
  nueva: { tipo: "poliza_nueva", mensaje: mensajePolizaNueva, modulo: "polizas" },
} as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/**
 * Lo que se puede adjuntar: el correo completo no debe pasar de 40 MB y los adjuntos viajan en
 * base64 (un tercio más grandes). Lo que no cabe va como enlace de descarga de 7 días.
 */
const MAX_BYTES_ADJUNTOS = 28 * 1024 * 1024;
const VIGENCIA_ENLACE_S = 7 * 24 * 3600;

type Documento = { que: string; clave: string | null; nombre: string | null; bytes: number | null };

/** Adjunta la carátula y el expediente (ZIP) de la póliza; lo que no cabe, como enlace. */
async function documentosDe(docs: Documento[]) {
  const almacen = getAlmacen();
  const adjuntos: Attachment[] = [];
  const resumen = { adjuntos: [] as string[], enlaces: [] as { que: string; url: string }[] };
  let disponible = MAX_BYTES_ADJUNTOS;
  for (const d of docs) {
    if (!d.clave || !d.nombre) continue;
    try {
      if (d.bytes !== null && d.bytes <= disponible) {
        const r = await fetch(await almacen.urlDescarga(d.clave), { signal: AbortSignal.timeout(60_000) });
        if (r.ok) {
          adjuntos.push({ filename: d.nombre, content: Buffer.from(await r.arrayBuffer()) });
          resumen.adjuntos.push(d.que);
          disponible -= d.bytes;
          continue;
        }
      }
      resumen.enlaces.push({ que: d.que, url: await almacen.urlDescarga(d.clave, { descargarComo: d.nombre, vigenciaS: VIGENCIA_ENLACE_S }) });
    } catch (e) {
      console.error("[correoPoliza] documento", d.que, e instanceof Error ? e.message : e);
    }
  }
  return { adjuntos, resumen };
}

/**
 * ¿La póliza es una renovación? Lo es si se capturó con "Renovar" o si se sumó sola a la cadena de
 * otra póliza (mismo número original y aseguradora) que empezó antes.
 */
export async function esRenovacion(
  poliza: { id: string; cadenaId: string; vigencia_inicio: Date },
  agenciaId: string
): Promise<boolean> {
  const [anterior, renovo] = await Promise.all([
    db.poliza.findFirst({
      where: { agenciaId, id: { not: poliza.id }, cadenaId: poliza.cadenaId, vigencia_inicio: { lt: poliza.vigencia_inicio } },
      select: { id: true },
    }),
    db.bitacora.findFirst({
      where: { agenciaId, accion: "poliza.renovar", entidad_id: poliza.id },
      select: { id: true },
    }),
  ]);
  return anterior !== null || renovo !== null;
}

/** A quién y cuándo se le envió a esta póliza el correo de la clase dada, si ya salió. */
export async function getCorreoPolizaEnviado(polizaId: string, agenciaId: string, clase: ClaseCorreoPoliza) {
  return db.avisoEnviado.findFirst({
    where: { agenciaId, tipo: CLASES[clase].tipo, referencia_id: polizaId },
    select: { destinatario: true, created_at: true },
  });
}

/**
 * Correo "Gracias por continuar con nosotros" al cliente registrado de una póliza recién renovada:
 * le confirma el número y la vigencia nuevos (ver enviarCorreoPoliza).
 */
export function enviarAgradecimientoRenovacion(polizaId: string, agenciaId: string): Promise<AgradecimientoRenovacion> {
  return enviarCorreoPoliza(polizaId, agenciaId, "renovacion");
}

/** Correo "Tu nueva póliza ya está lista" al cliente registrado de una póliza nueva (ver enviarCorreoPoliza). */
export function enviarPolizaNueva(polizaId: string, agenciaId: string): Promise<AgradecimientoRenovacion> {
  return enviarCorreoPoliza(polizaId, agenciaId, "nueva");
}

/**
 * Le entrega al cliente registrado su póliza con la carátula y el expediente. Sale de la dirección
 * universal con la marca de la agencia; las respuestas van a su correo de servicio y su correo de
 * copia recibe copia oculta. Queda en avisos_enviados, así que cada clase sale una sola vez por
 * póliza. Nunca lanza: si no se puede enviar, dice por qué (la póliza ya quedó guardada).
 */
async function enviarCorreoPoliza(polizaId: string, agenciaId: string, clase: ClaseCorreoPoliza): Promise<AgradecimientoRenovacion> {
  const { tipo, mensaje: redactar, modulo } = CLASES[clase];
  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, agenciaId },
    select: {
      numeroImpreso: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      caratula_path: true,
      caratula_nombre: true,
      caratula_bytes: true,
      expediente_path: true,
      expediente_nombre: true,
      expediente_bytes: true,
      cliente: { select: { nombre: true, email: true } },
      aseguradora: { select: { nombre: true } },
      agencia: {
        select: {
          nombre: true,
          colorHex: true,
          logoUrl: true,
          logoDocumentosUrl: true,
          correoServicio: true,
          correoCopiaAvisos: true,
        },
      },
    },
  });
  if (!poliza) return { enviado: false, motivo: "la póliza ya no existe." };
  const email = poliza.cliente.email.trim();
  if (!emailValido(email)) return { enviado: false, motivo: "el cliente no tiene un correo válido registrado." };
  try {
    getConfigCorreo();
  } catch (e) {
    if (e instanceof CorreoNoConfiguradoError) return { enviado: false, motivo: "el envío de correos no está configurado." };
    throw e;
  }

  const { agencia } = poliza;
  const where = { tipo_referencia_id: { tipo, referencia_id: polizaId } };
  try {
    await db.avisoEnviado.create({ data: { agenciaId, tipo, referencia_id: polizaId, destinatario: email } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { enviado: false, motivo: "ya se le había enviado." };
    }
    console.error(`[correoPoliza:${clase}]`, e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "no se pudo registrar el envío." };
  }

  try {
    const documentos = await documentosDe([
      { que: "la carátula", clave: poliza.caratula_path, nombre: poliza.caratula_nombre, bytes: poliza.caratula_bytes },
      { que: "el expediente completo", clave: poliza.expediente_path, nombre: poliza.expediente_nombre, bytes: poliza.expediente_bytes },
    ]);
    const { asunto, titulo, mensaje } = redactar({
      documentos: documentos.resumen,
      agencia: agencia.nombre,
      poliza: poliza.numeroImpreso,
      ramo: ramoLabel[poliza.ramo],
      aseguradora: poliza.aseguradora.nombre,
      inicio: iso(poliza.vigencia_inicio),
      fin: iso(poliza.vigencia_fin),
      correoServicio: agencia.correoServicio ?? undefined,
    });
    const { html, texto } = await renderNotificacionCrm({
      nombreCrm: agencia.nombre,
      colorTema: agencia.colorHex ?? COLOR_MARCA_PREDETERMINADO,
      logoUrl: logoParaDocumentos(agencia),
      nombreUsuario: poliza.cliente.nombre,
      tituloNotificacion: titulo,
      mensajePrincipal: mensaje,
    });
    const r = await enviarAviso({
      agencia: agencia.nombre,
      para: email,
      asunto,
      html,
      texto,
      copia: agencia.correoCopiaAvisos ?? undefined,
      responderA: agencia.correoServicio ?? undefined,
      modulo,
      adjuntos: documentos.adjuntos,
    });
    if (r.ok) return { enviado: true, email };
    console.error(`[correoPoliza:${clase}]`, polizaId, r.error);
  } catch (e) {
    console.error(`[correoPoliza:${clase}]`, polizaId, e instanceof Error ? e.message : e);
  }
  // No salió: se borra el registro para que no cuente como enviado.
  await db.avisoEnviado.delete({ where }).catch(() => {});
  return { enviado: false, motivo: "el servicio de correo no lo aceptó; inténtalo más tarde." };
}
