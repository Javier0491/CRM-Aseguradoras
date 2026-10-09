"use server";

import { headers } from "next/headers";

import { COLOR_MARCA_PREDETERMINADO } from "@/lib/agencias/marca";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { emailValido, enviarCorreoPlataforma } from "@/lib/comunicaciones/envio";
import {
  correoSolicitudDemo,
  leerSolicitudDemo,
  validarSolicitudDemo,
  type ErroresDemo,
  type SolicitudDemo,
} from "@/lib/landing/demo";
import { logoPlataformaUrl } from "@/lib/plataforma/marca";

// `valores` regresa lo capturado: React limpia el formulario al terminar la acción.
export type EstadoDemo = { ok?: boolean; error?: string; errores?: ErroresDemo; valores?: SolicitudDemo };

/** Solicitudes por IP en la ventana; basta para frenar envíos repetidos (es por instancia). */
const MAX_POR_VENTANA = 3;
const VENTANA_MS = 10 * 60_000;
const envios = new Map<string, number[]>();

function excedeLimite(ip: string) {
  const ahora = Date.now();
  const recientes = (envios.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= MAX_POR_VENTANA) return true;
  recientes.push(ahora);
  envios.set(ip, recientes);
  if (envios.size > 5000) envios.clear();
  return false;
}

/**
 * Buzón del equipo comercial: PLATAFORMA_CORREO_VENTAS (uno o varios, separados por comas) o, si
 * no está, las cuentas SUPERADMIN activas.
 */
async function destinatariosDemo() {
  const configurados = (process.env.PLATAFORMA_CORREO_VENTAS ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(emailValido);
  if (configurados.length > 0) return configurados;
  const superadmins = await db.usuario.findMany({
    where: { rolSistema: "SUPERADMIN", activo: true },
    select: { email: true },
  });
  return superadmins.map((s) => s.email).filter(emailValido);
}

const ERROR_ENVIO = "No pudimos enviar tu solicitud en este momento. Inténtalo de nuevo en unos minutos.";

/** Formulario "Agendar Demo VIP" de la landing (pública: no requiere sesión). */
export async function solicitarDemo(_prev: EstadoDemo, formData: FormData): Promise<EstadoDemo> {
  const { datos, esBot } = leerSolicitudDemo(formData);
  // Al bot se le responde como si hubiera funcionado: no aprende a esquivar la trampa.
  if (esBot) return { ok: true };

  const errores = validarSolicitudDemo(datos);
  if (Object.keys(errores).length > 0) return { errores, valores: datos };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  if (excedeLimite(ip)) {
    return { error: "Ya recibimos tus solicitudes. Te contactaremos pronto.", valores: datos };
  }

  try {
    const para = await destinatariosDemo();
    if (para.length === 0) {
      console.error("[demo] sin destinatario: configura PLATAFORMA_CORREO_VENTAS");
      return { error: ERROR_ENVIO, valores: datos };
    }
    const { asunto, lineas } = correoSolicitudDemo(datos);
    const { html, texto } = await renderNotificacionCrm({
      nombreCrm: "ZenSecure",
      colorTema: COLOR_MARCA_PREDETERMINADO,
      logoUrl: logoPlataformaUrl(),
      nombreUsuario: "equipo de Atelier Zenith",
      tituloNotificacion: "Nueva solicitud de Demo VIP",
      mensajePrincipal: lineas.join("\n"),
    });
    const { enviados, errores: fallas } = await enviarCorreoPlataforma({ para, asunto, html, texto, responderA: datos.correo });
    if (enviados === 0) {
      console.error("[demo] no se pudo enviar", fallas);
      return { error: ERROR_ENVIO, valores: datos };
    }
  } catch (e) {
    console.error("[demo] no se pudo enviar", e instanceof Error ? e.message : e);
    return { error: ERROR_ENVIO, valores: datos };
  }
  return { ok: true };
}
