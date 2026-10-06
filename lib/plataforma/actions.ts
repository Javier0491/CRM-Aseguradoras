"use server";

import { revalidatePath } from "next/cache";

import { COLOR_MARCA_PREDETERMINADO } from "@/lib/agencias/marca";
import { getCurrentUser, type UsuarioSesion } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { CorreoNoConfiguradoError, emailValido, enviarCorreoPlataforma } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { formatFecha, formatMoneda, hoyISO } from "@/lib/format";
import { MAX_DIAS_TOLERANCIA, MAX_MESES_PAGO, siguientePagadoHasta } from "@/lib/plataforma/cobranza";
import { nombrePlataforma } from "@/lib/plataforma/marca";
import { parseNumero } from "@/lib/polizas/validacion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v: string) => FECHA.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type PlataformaResultado = { ok: true; mensaje?: string } | { ok: false; error: string };

/** El rol se verifica en la base de datos, nunca en el token. */
async function superadmin(): Promise<UsuarioSesion | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const perfil = await db.usuario.findUnique({ where: { id: user.id }, select: { rolSistema: true } });
  return perfil?.rolSistema === "SUPERADMIN" ? user : null;
}

/** Monto con dos decimales, mayor o igual a cero; null si no es válido. */
function monto(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = parseNumero(v);
  return Number.isFinite(n) && n >= 0 && Math.round(n * 100) / 100 === n && n < 10_000_000 ? n : null;
}

/**
 * SUPERADMIN: cuota mensual de una agencia, hasta cuándo está pagada, días de tolerancia,
 * suspensión automática y correo para los avisos de cobro. Cuota vacía = sin cobranza.
 */
export async function configurarCobranza(
  agenciaId: string,
  datos: {
    cuotaMensual: string;
    pagadoHasta: string;
    diasTolerancia: string;
    suspensionAutomatica: boolean;
    correoFacturacion: string;
  }
): Promise<PlataformaResultado> {
  const user = await superadmin();
  if (!user) return { ok: false, error: "Solo un superadministrador configura la cobranza." };
  if (typeof agenciaId !== "string" || !UUID.test(agenciaId) || typeof datos !== "object" || datos === null) {
    return { ok: false, error: "Datos inválidos." };
  }
  const sinCuota = typeof datos.cuotaMensual === "string" && datos.cuotaMensual.trim() === "";
  const cuota = sinCuota ? null : monto(datos.cuotaMensual);
  if (!sinCuota && cuota === null) return { ok: false, error: "Escribe una cuota mensual válida." };
  const pagadoHasta = typeof datos.pagadoHasta === "string" ? datos.pagadoHasta.trim() : "";
  if (pagadoHasta && !fechaValida(pagadoHasta)) return { ok: false, error: "La fecha «pagado hasta» no es válida." };
  if (cuota !== null && !pagadoHasta) return { ok: false, error: "Indica hasta qué fecha está pagado el servicio." };
  const tolerancia = Number(datos.diasTolerancia);
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > MAX_DIAS_TOLERANCIA) {
    return { ok: false, error: `Los días de tolerancia van de 0 a ${MAX_DIAS_TOLERANCIA}.` };
  }
  const correo = typeof datos.correoFacturacion === "string" ? datos.correoFacturacion.trim().toLowerCase() : "";
  if (correo && !emailValido(correo)) return { ok: false, error: "El correo de facturación no es válido." };

  const agencia = await db.agencia.findUnique({ where: { id: agenciaId }, select: { nombre: true, pagadoHasta: true } });
  if (!agencia) return { ok: false, error: "La agencia ya no existe." };
  await db.$transaction(async (tx) => {
    await tx.agencia.update({
      where: { id: agenciaId },
      data: {
        cuotaMensual: cuota === null ? null : cuota.toFixed(2),
        pagadoHasta: pagadoHasta ? new Date(`${pagadoHasta}T00:00:00Z`) : null,
        diasToleranciaPago: tolerancia,
        suspensionAutomatica: cuota !== null && datos.suspensionAutomatica === true,
        correoFacturacion: correo || null,
        // Otra fecha de pago es otro periodo: se podrá volver a avisar.
        ...(iso(agencia.pagadoHasta) !== (pagadoHasta || null) && { avisoCobroEnviadoPara: null }),
      },
    });
    await registrarBitacora(
      { id: user.id, email: user.email, agenciaId },
      {
        accion: "plataforma.cobranza",
        entidad: "agencia",
        entidadId: agenciaId,
        descripcion:
          cuota === null
            ? `${user.email ?? "Superadmin"} quitó la cobranza de ${agencia.nombre}`
            : `${user.email ?? "Superadmin"} configuró la cobranza de ${agencia.nombre}: ${formatMoneda(cuota)} al mes, pagado hasta el ${formatFecha(`${pagadoHasta}T00:00:00Z`)}`,
      },
      tx
    );
  });
  revalidatePath("/superadmin");
  return { ok: true };
}

/**
 * SUPERADMIN: registra un pago de la agencia. Recorre "pagado hasta" los meses pagados (desde lo
 * ya pagado, aunque esté vencido) y, si estaba suspendida y se pide, la reactiva.
 */
export async function registrarPagoPlataforma(
  agenciaId: string,
  datos: { fecha: string; monto: string; meses: number; nota?: string; reactivar?: boolean }
): Promise<PlataformaResultado> {
  const user = await superadmin();
  if (!user) return { ok: false, error: "Solo un superadministrador registra pagos." };
  if (typeof agenciaId !== "string" || !UUID.test(agenciaId) || typeof datos !== "object" || datos === null) {
    return { ok: false, error: "Datos inválidos." };
  }
  const fecha = typeof datos.fecha === "string" ? datos.fecha : "";
  if (!fechaValida(fecha) || fecha > hoyISO()) return { ok: false, error: "La fecha del pago no es válida." };
  const importe = monto(datos.monto);
  if (importe === null || importe <= 0) return { ok: false, error: "Escribe el monto pagado." };
  if (!Number.isInteger(datos.meses) || datos.meses < 1 || datos.meses > MAX_MESES_PAGO) {
    return { ok: false, error: `El pago cubre de 1 a ${MAX_MESES_PAGO} meses.` };
  }
  const nota = typeof datos.nota === "string" ? datos.nota.trim().slice(0, 300) : "";

  const agencia = await db.agencia.findUnique({
    where: { id: agenciaId },
    select: { nombre: true, pagadoHasta: true, suspendida: true },
  });
  if (!agencia) return { ok: false, error: "La agencia ya no existe." };
  const cubreHasta = siguientePagadoHasta(iso(agencia.pagadoHasta), hoyISO(), datos.meses);
  const reactivar = agencia.suspendida && datos.reactivar === true;

  await db.$transaction(async (tx) => {
    await tx.pagoPlataforma.create({
      data: {
        agenciaId,
        fecha: new Date(`${fecha}T00:00:00Z`),
        monto: importe.toFixed(2),
        cubreHasta: new Date(`${cubreHasta}T00:00:00Z`),
        nota: nota || null,
        registradoPor: user.email,
      },
    });
    await tx.agencia.update({
      where: { id: agenciaId },
      data: {
        pagadoHasta: new Date(`${cubreHasta}T00:00:00Z`),
        avisoCobroEnviadoPara: null,
        ...(reactivar && { suspendida: false, suspendidaAt: null, motivoSuspension: null }),
      },
    });
    await registrarBitacora(
      { id: user.id, email: user.email, agenciaId },
      {
        accion: "plataforma.pago",
        entidad: "agencia",
        entidadId: agenciaId,
        descripcion:
          `${user.email ?? "Superadmin"} registró un pago de ${formatMoneda(importe)} de ${agencia.nombre}; ` +
          `pagado hasta el ${formatFecha(`${cubreHasta}T00:00:00Z`)}${reactivar ? "; se reactivó la agencia" : ""}`,
      },
      tx
    );
  });
  revalidatePath("/superadmin");
  revalidatePath("/", "layout");
  return {
    ok: true,
    mensaje: `Pagado hasta el ${formatFecha(`${cubreHasta}T00:00:00Z`)}${reactivar ? ". La agencia ya está activa." : "."}`,
  };
}

/** SUPERADMIN: correo de prueba a su propia cuenta para comprobar Resend (Diagnóstico). */
export async function enviarCorreoPrueba(): Promise<PlataformaResultado> {
  const user = await superadmin();
  if (!user) return { ok: false, error: "Solo un superadministrador puede hacer la prueba." };
  if (!user.email) return { ok: false, error: "Tu cuenta no tiene correo." };
  try {
    const { html, texto } = await renderNotificacionCrm({
      nombreCrm: nombrePlataforma(),
      colorTema: COLOR_MARCA_PREDETERMINADO,
      nombreUsuario: "superadministrador",
      tituloNotificacion: "Correo de prueba",
      mensajePrincipal: "Si lees esto, el envío de correos de la plataforma funciona.",
    });
    const r = await enviarCorreoPlataforma({ para: [user.email], asunto: "Correo de prueba", html, texto });
    if (r.enviados === 0) return { ok: false, error: r.errores[0] ?? "Resend rechazó el envío." };
    return { ok: true, mensaje: `Enviado a ${user.email}.` };
  } catch (e) {
    if (e instanceof CorreoNoConfiguradoError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." };
  }
}
