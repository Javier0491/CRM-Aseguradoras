import "server-only";

import type { Attachment } from "resend";

import { ramoLabel } from "@/components/polizas/poliza-ui";
import { getAlmacen } from "@/lib/archivos/almacen";
import { COLOR_MARCA_PREDETERMINADO, logoParaDocumentos } from "@/lib/agencias/marca";
import {
  mensajeAgradecimientoRenovacion,
  mensajeEndoso,
  mensajePolizaNueva,
  type DatosEntregaPoliza,
} from "@/lib/avisos/mensajes";
import { CorreoNoConfiguradoError, emailValido, enviarAviso, getConfigCorreo } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { Prisma } from "@/lib/generated/prisma/client";
import { etiquetaEndoso } from "@/lib/polizas/estatus";
import type { AgradecimientoRenovacion } from "@/lib/polizas/guardar";

/**
 * Correos que le entregan al cliente su póliza: el agradecimiento de una renovación o el aviso de
 * que su póliza nueva ya está lista (cada uno sale una sola vez por póliza) y el aviso de endoso
 * con la póliza actualizada (uno por endoso registrado; sin endoso, las veces que haga falta).
 */
export type ClaseCorreoPoliza = "renovacion" | "nueva" | "endoso";

const CLASES = {
  renovacion: { tipo: "agradecimiento_renovacion", mensaje: mensajeAgradecimientoRenovacion, modulo: "renovaciones" },
  nueva: { tipo: "poliza_nueva", mensaje: mensajePolizaNueva, modulo: "polizas" },
  endoso: { tipo: "endoso_poliza", mensaje: mensajeEndoso, modulo: "polizas" },
} as const;

/** Clave del aviso de endoso en avisos_enviados: "{polizaId}:{endosoId}" o "{polizaId}:general-{marca}". */
export const referenciaEndoso = (polizaId: string, endosoId: string | null) =>
  `${polizaId}:${endosoId ?? `general-${Date.now()}`}`;

/** Avisos de endoso que ya se le enviaron al cliente de esta póliza, del más reciente al más antiguo. */
export async function getAvisosEndoso(polizaId: string, agenciaId: string) {
  const avisos = await db.avisoEnviado.findMany({
    where: { agenciaId, tipo: CLASES.endoso.tipo, referencia_id: { startsWith: `${polizaId}:` } },
    select: { referencia_id: true, destinatario: true, created_at: true },
    orderBy: { created_at: "desc" },
  });
  return avisos.map((a) => {
    const resto = a.referencia_id.slice(polizaId.length + 1);
    return { endosoId: resto.startsWith("general-") ? null : resto, destinatario: a.destinatario, fecha: a.created_at };
  });
}
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
export function enviarAgradecimientoRenovacion(
  polizaId: string,
  agenciaId: string,
  cco: string[] = []
): Promise<AgradecimientoRenovacion> {
  return enviarCorreoPoliza(polizaId, agenciaId, "renovacion", cco);
}

/** Correo "Tu nueva póliza ya está lista" al cliente registrado de una póliza nueva (ver enviarCorreoPoliza). */
export function enviarPolizaNueva(polizaId: string, agenciaId: string, cco: string[] = []): Promise<AgradecimientoRenovacion> {
  return enviarCorreoPoliza(polizaId, agenciaId, "nueva", cco);
}

/**
 * "Se realizaron los cambios a tu póliza" al cliente registrado, con la póliza ya actualizada (ver
 * enviarCorreoPoliza). Con `endosoId`, describe ese movimiento y sale una vez por endoso.
 */
export async function enviarAvisoEndoso(
  polizaId: string,
  agenciaId: string,
  endosoId: string | null,
  cco: string[] = []
): Promise<AgradecimientoRenovacion> {
  let endoso: DatosEntregaPoliza["endoso"];
  if (endosoId) {
    const e = await db.endoso.findFirst({
      where: { id: endosoId, polizaId, agenciaId },
      select: { tipo: true, numero: true, fecha: true, descripcion: true },
    });
    if (!e) return { enviado: false, motivo: "el endoso ya no existe." };
    endoso = { tipo: etiquetaEndoso(e.tipo), numero: e.numero, fecha: iso(e.fecha), descripcion: e.descripcion };
  }
  return enviarCorreoPoliza(polizaId, agenciaId, "endoso", cco, { referencia: referenciaEndoso(polizaId, endosoId), endoso });
}

/**
 * Le entrega al cliente registrado su póliza con la carátula y el expediente. Sale de la dirección
 * universal con la marca de la agencia; las respuestas van a su correo de servicio, y su correo de
 * copia y las direcciones de `cco` reciben copia oculta. Queda en avisos_enviados, así que cada clase sale una sola vez por
 * póliza. Nunca lanza: si no se puede enviar, dice por qué (la póliza ya quedó guardada).
 */
async function enviarCorreoPoliza(
  polizaId: string,
  agenciaId: string,
  clase: ClaseCorreoPoliza,
  cco: string[],
  extra: { referencia?: string; endoso?: DatosEntregaPoliza["endoso"] } = {}
): Promise<AgradecimientoRenovacion> {
  const { tipo, mensaje: redactar, modulo } = CLASES[clase];
  // Renovación y póliza nueva: una vez por póliza. Endoso: la referencia la da enviarAvisoEndoso.
  const referencia_id = extra.referencia ?? polizaId;
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
  const where = { tipo_referencia_id: { tipo, referencia_id } };
  try {
    await db.avisoEnviado.create({ data: { agenciaId, tipo, referencia_id, destinatario: email } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { enviado: false, motivo: clase === "endoso" ? "ya se le envió el aviso de este endoso." : "ya se le había enviado." };
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
      endoso: extra.endoso,
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
      cco,
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
