import "server-only";

import { COLOR_MARCA_PREDETERMINADO } from "@/lib/agencias/marca";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { emailValido, enviarCorreoPlataforma } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { formatFecha, formatMoneda, hoyISO } from "@/lib/format";
import { accionCobroDiaria, estadoCobro } from "@/lib/plataforma/cobranza";
import { nombrePlataforma } from "@/lib/plataforma/marca";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type ResumenCobranza = { avisadas: number; suspendidas: number; sinCorreo: number; errores: string[] };

/** Destinatarios de los avisos de cobro: el correo de facturación o los administradores activos. */
async function destinatarios(agencia: { id: string; correoFacturacion: string | null }) {
  if (agencia.correoFacturacion && emailValido(agencia.correoFacturacion)) return [agencia.correoFacturacion.trim()];
  const admins = await db.usuario.findMany({
    where: { agenciaId: agencia.id, rol: "ADMIN", activo: true, rolSistema: "USER" },
    select: { email: true },
  });
  return admins.map((a) => a.email).filter(emailValido);
}

/**
 * Tarea diaria de la cobranza de la plataforma: avisa a las agencias cuyo periodo pagado está por
 * vencer o venció (una vez por periodo) y suspende las que pasaron su tolerancia si tienen la
 * suspensión automática. Cada suspensión queda en la bitácora de la agencia como movimiento del
 * sistema.
 */
export async function procesarCobranzaPlataforma(): Promise<ResumenCobranza> {
  const hoy = hoyISO();
  const resumen: ResumenCobranza = { avisadas: 0, suspendidas: 0, sinCorreo: 0, errores: [] };
  const plataforma = nombrePlataforma();
  const agencias = await db.agencia.findMany({
    where: { suspendida: false, cuotaMensual: { not: null }, pagadoHasta: { not: null } },
    select: {
      id: true,
      nombre: true,
      cuotaMensual: true,
      pagadoHasta: true,
      diasToleranciaPago: true,
      suspensionAutomatica: true,
      avisoCobroEnviadoPara: true,
      correoFacturacion: true,
      suspendida: true,
    },
  });

  for (const a of agencias) {
    const cobro = {
      cuotaMensual: a.cuotaMensual === null ? null : Number(a.cuotaMensual),
      pagadoHasta: iso(a.pagadoHasta),
      diasTolerancia: a.diasToleranciaPago,
    };
    const accion = accionCobroDiaria(
      { ...cobro, suspendida: a.suspendida, suspensionAutomatica: a.suspensionAutomatica, avisoCobroEnviadoPara: iso(a.avisoCobroEnviadoPara) },
      hoy
    );
    if (!accion) continue;
    const { estado, limite } = estadoCobro(cobro, hoy);
    const vence = formatFecha(`${cobro.pagadoHasta}T00:00:00Z`);

    if (accion === "suspender") {
      await db.$transaction(async (tx) => {
        await tx.agencia.update({
          where: { id: a.id },
          data: { suspendida: true, suspendidaAt: new Date(), motivoSuspension: `Falta de pago: el servicio venció el ${vence}` },
        });
        await registrarBitacora(
          { id: null, email: null, agenciaId: a.id },
          {
            accion: "agencia.suspender",
            entidad: "agencia",
            entidadId: a.id,
            descripcion: `Suspensión automática por falta de pago (venció el ${vence} y pasó la tolerancia)`,
          },
          tx
        );
      });
      resumen.suspendidas++;
    }

    const para = await destinatarios(a);
    if (para.length === 0) {
      resumen.sinCorreo++;
      continue;
    }
    const cuota = cobro.cuotaMensual === null ? "" : ` La cuota mensual es de ${formatMoneda(cobro.cuotaMensual)}.`;
    const { asunto, titulo, mensaje } =
      accion === "suspender"
        ? {
            asunto: `Servicio suspendido: ${a.nombre}`,
            titulo: "Tu servicio está suspendido",
            mensaje: [
              `El pago del servicio de ${a.nombre} venció el ${vence} y no se ha registrado, así que el acceso al CRM está suspendido.`,
              "Tus datos se conservan completos. En cuanto registremos el pago se reactiva el acceso.",
              `Si ya pagaste, responde este correo con tu comprobante.${cuota}`,
            ].join("\n")
          }
        : estado === "por_vencer"
          ? {
              asunto: `Tu servicio vence el ${vence}`,
              titulo: "Tu servicio está por vencer",
              mensaje: [
                `El periodo pagado del CRM de ${a.nombre} termina el ${vence}.${cuota}`,
                "Realiza tu pago antes de esa fecha para no interrumpir el servicio. Si ya pagaste, haz caso omiso de este mensaje.",
              ].join("\n"),
            }
          : {
              asunto: `Pago vencido: ${a.nombre}`,
              titulo: "Tu pago está vencido",
              mensaje: [
                `El periodo pagado del CRM de ${a.nombre} terminó el ${vence}.${cuota}`,
                limite
                  ? `Para evitar la suspensión del servicio, realiza tu pago a más tardar el ${formatFecha(`${limite}T00:00:00Z`)}.`
                  : "Realiza tu pago para evitar la suspensión del servicio.",
                "Si ya pagaste, responde este correo con tu comprobante.",
              ].join("\n"),
            };
    try {
      const { html, texto } = await renderNotificacionCrm({
        nombreCrm: plataforma,
        colorTema: COLOR_MARCA_PREDETERMINADO,
        nombreUsuario: a.nombre,
        tituloNotificacion: titulo,
        mensajePrincipal: mensaje,
      });
      const r = await enviarCorreoPlataforma({ para, asunto, html, texto });
      resumen.errores.push(...r.errores.map((e) => `${a.nombre}: ${e}`));
      if (r.enviados > 0) {
        if (accion === "avisar") resumen.avisadas++;
        await db.agencia.update({ where: { id: a.id }, data: { avisoCobroEnviadoPara: a.pagadoHasta } });
      }
    } catch (e) {
      resumen.errores.push(`${a.nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return resumen;
}
