import "server-only";

import { ramoLabel } from "@/components/polizas/poliza-ui";
import { COLOR_MARCA_PREDETERMINADO, logoParaDocumentos } from "@/lib/agencias/marca";
import { mensajeAgradecimientoRenovacion } from "@/lib/avisos/mensajes";
import { CorreoNoConfiguradoError, emailValido, enviarAviso, getConfigCorreo } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { Prisma } from "@/lib/generated/prisma/client";
import type { AgradecimientoRenovacion } from "@/lib/polizas/guardar";

/** Tipo en avisos_enviados: un agradecimiento por póliza renovada. */
const TIPO = "agradecimiento_renovacion";
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Correo "Gracias por continuar con nosotros" al cliente registrado de una póliza recién renovada:
 * le confirma el número y la vigencia nuevos. Sale de la dirección universal con la marca de la
 * agencia; las respuestas van a su correo de servicio y su correo de copia recibe copia oculta.
 * Queda en avisos_enviados, así que sale una sola vez por póliza. Nunca lanza: si no se puede
 * enviar, dice por qué (la renovación ya quedó guardada).
 */
export async function enviarAgradecimientoRenovacion(polizaId: string, agenciaId: string): Promise<AgradecimientoRenovacion> {
  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, agenciaId },
    select: {
      numeroImpreso: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
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
  const where = { tipo_referencia_id: { tipo: TIPO, referencia_id: polizaId } };
  try {
    await db.avisoEnviado.create({ data: { agenciaId, tipo: TIPO, referencia_id: polizaId, destinatario: email } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { enviado: false, motivo: "ya se le había enviado." };
    }
    console.error("[agradecimientoRenovacion]", e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "no se pudo registrar el envío." };
  }

  try {
    const { asunto, titulo, mensaje } = mensajeAgradecimientoRenovacion({
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
      modulo: "renovaciones",
    });
    if (r.ok) return { enviado: true, email };
    console.error("[agradecimientoRenovacion]", polizaId, r.error);
  } catch (e) {
    console.error("[agradecimientoRenovacion]", polizaId, e instanceof Error ? e.message : e);
  }
  // No salió: se borra el registro para que no cuente como enviado.
  await db.avisoEnviado.delete({ where }).catch(() => {});
  return { enviado: false, motivo: "el servicio de correo no lo aceptó; inténtalo más tarde." };
}
