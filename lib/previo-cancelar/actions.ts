"use server";

import { COLOR_MARCA_PREDETERMINADO, logoParaDocumentos } from "@/lib/agencias/marca";
import { alcanceDe, polizasDe } from "@/lib/auth/alcance";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { leerCco, MAX_CCO } from "@/lib/comunicaciones/correo";
import { CorreoNoConfiguradoError, emailValido, enviarAviso, getConfigCorreo } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { Prisma, type Ramo } from "@/lib/generated/prisma/client";
import { extraerPolizaVigor } from "@/lib/polizas/polizaParser";
import {
  fechaIsoValida,
  MAX_POLIZAS_PREVIO,
  mensajePrevioCancelar,
  ramoAviso,
  referenciaPrevio,
  TANDA_ENVIO_PREVIO,
  TIPO_AVISO_PREVIO,
} from "@/lib/previo-cancelar/mensaje";

const SESION = "Tu sesión venció. Vuelve a iniciar sesión.";

/** Póliza de la cartera que corresponde a un renglón del Excel. */
export type PolizaPrevio = {
  /** Número tal como viene en el Excel (la llave del renglón). */
  numero: string;
  polizaId: string;
  numeroImpreso: string;
  polizaVigor: string | null;
  ramo: Ramo;
  aseguradora: string;
  cliente: { id: string; nombre: string };
  /** Correo válido del cliente, o null si no tiene. */
  email: string | null;
  cancelada: boolean;
  vigenciaFin: string;
  /** Aviso de este mes ya enviado. */
  avisado: { destinatario: string; fecha: string } | null;
};

export type BuscarPrevioResultado = { ok: true; polizas: PolizaPrevio[] } | { ok: false; error: string };

const normalizar = (n: string) => n.replace(/\s+/g, "").toUpperCase();

/**
 * Busca en la cartera visible las pólizas del Excel, por póliza vigor o por número impreso. Si un
 * número coincide con varias vigencias, se queda la vigente más reciente. `fechaVentanilla` dice de
 * qué mes son los avisos ya enviados que se marcan.
 */
export async function buscarPolizasPrevio(numeros: string[], fechaVentanilla: string): Promise<BuscarPrevioResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  if (!Array.isArray(numeros) || numeros.length > MAX_POLIZAS_PREVIO || !numeros.every((n) => typeof n === "string" && n.length <= 60)) {
    return { ok: false, error: `El archivo debe traer como máximo ${MAX_POLIZAS_PREVIO} pólizas.` };
  }
  if (!fechaIsoValida(fechaVentanilla)) return { ok: false, error: "Fecha límite no válida." };

  // Cada número del Excel con sus variantes (p. ej. "M0563109" o el número con ceros a la izquierda).
  const variantes = new Map<string, string>();
  for (const n of numeros.map(normalizar)) {
    for (const v of new Set([n, extraerPolizaVigor(n), n.replace(/^0+/, "")])) if (v && !variantes.has(v)) variantes.set(v, n);
  }
  const claves = [...variantes.keys()];
  const candidatas = await db.poliza.findMany({
    where: { ...polizasDe(alcanceDe(user)), OR: [{ polizaVigor: { in: claves } }, { numeroImpreso: { in: claves } }] },
    select: {
      id: true,
      numeroImpreso: true,
      polizaVigor: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      canceladaAt: true,
      aseguradora: { select: { nombre: true } },
      cliente: { select: { id: true, nombre: true, email: true } },
    },
    orderBy: { vigencia_inicio: "desc" },
  });

  // La mejor por número: primero las no canceladas; entre ellas, la de vigencia más reciente (orderBy).
  const elegida = new Map<string, (typeof candidatas)[number]>();
  for (const p of candidatas) {
    const numero =
      (p.polizaVigor && variantes.get(normalizar(p.polizaVigor))) ?? variantes.get(normalizar(p.numeroImpreso));
    if (!numero) continue;
    const actual = elegida.get(numero);
    if (!actual || (actual.canceladaAt && !p.canceladaAt)) elegida.set(numero, p);
  }

  const avisos = await db.avisoEnviado.findMany({
    where: {
      agenciaId: user.agenciaId,
      tipo: TIPO_AVISO_PREVIO,
      referencia_id: { in: [...elegida.values()].map((p) => referenciaPrevio(p.id, fechaVentanilla)) },
    },
    select: { referencia_id: true, destinatario: true, created_at: true },
  });
  const avisoDe = new Map(avisos.map((a) => [a.referencia_id, a]));

  return {
    ok: true,
    polizas: [...elegida].map(([numero, p]) => {
      const aviso = avisoDe.get(referenciaPrevio(p.id, fechaVentanilla));
      const email = p.cliente.email.trim();
      return {
        numero,
        polizaId: p.id,
        numeroImpreso: p.numeroImpreso,
        polizaVigor: p.polizaVigor,
        ramo: p.ramo,
        aseguradora: p.aseguradora.nombre,
        cliente: { id: p.cliente.id, nombre: p.cliente.nombre },
        email: emailValido(email) ? email : null,
        cancelada: p.canceladaAt !== null,
        vigenciaFin: p.vigencia_fin.toISOString().slice(0, 10),
        avisado: aviso ? { destinatario: aviso.destinatario, fecha: aviso.created_at.toISOString() } : null,
      };
    }),
  };
}

export type EnvioPrevio = { polizaId: string; referencia?: string };
export type ResultadoEnvioPrevio = { polizaId: string; ok: true; email: string } | { polizaId: string; ok: false; error: string };
export type EnviarPrevioResultado = { ok: true; resultados: ResultadoEnvioPrevio[] } | { ok: false; error: string };

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envía el aviso "previo a cancelar" al cliente registrado de cada póliza (una tanda de hasta
 * TANDA_ENVIO_PREVIO; el navegador manda las siguientes). Sale una vez por póliza y mes: queda en
 * avisos_enviados y, si el correo no sale, se borra para poder reintentarlo.
 */
export async function enviarAvisosPrevio(
  envios: EnvioPrevio[],
  fechas: { ventanilla: string; portal: string },
  ccoTexto = ""
): Promise<EnviarPrevioResultado> {
  const user = await getUsuarioCrm();
  if (!user) return { ok: false, error: SESION };
  if (!Array.isArray(envios) || envios.length === 0 || envios.length > TANDA_ENVIO_PREVIO) {
    return { ok: false, error: "Tanda de envío no válida." };
  }
  if (!envios.every((e) => typeof e === "object" && e !== null && typeof e.polizaId === "string")) {
    return { ok: false, error: "Tanda de envío no válida." };
  }
  if (typeof fechas !== "object" || fechas === null || !fechaIsoValida(fechas.ventanilla) || !fechaIsoValida(fechas.portal)) {
    return { ok: false, error: "Revisa las fechas límite de pago." };
  }
  const cco = leerCco(typeof ccoTexto === "string" ? ccoTexto.slice(0, 1000) : "");
  if (cco.invalidos.length > 0) return { ok: false, error: `Correo inválido en CCO: ${cco.invalidos[0]}` };
  if (cco.correos.length > MAX_CCO) return { ok: false, error: `La copia oculta admite como máximo ${MAX_CCO} correos.` };
  try {
    getConfigCorreo();
  } catch (e) {
    if (e instanceof CorreoNoConfiguradoError) return { ok: false, error: "El envío de correos no está configurado." };
    throw e;
  }

  const [agencia, polizas] = await Promise.all([
    db.agencia.findUniqueOrThrow({
      where: { id: user.agenciaId },
      select: { nombre: true, colorHex: true, logoUrl: true, logoDocumentosUrl: true, correoServicio: true, correoCopiaAvisos: true },
    }),
    db.poliza.findMany({
      where: { ...polizasDe(alcanceDe(user)), id: { in: envios.map((e) => e.polizaId) } },
      select: {
        id: true,
        numeroImpreso: true,
        polizaVigor: true,
        ramo: true,
        canceladaAt: true,
        aseguradora: { select: { nombre: true } },
        cliente: { select: { nombre: true, email: true } },
      },
    }),
  ]);
  const porId = new Map(polizas.map((p) => [p.id, p]));

  const resultados: ResultadoEnvioPrevio[] = [];
  for (const [i, envio] of envios.entries()) {
    const fallo = (error: string) => resultados.push({ polizaId: envio.polizaId, ok: false, error });
    const p = porId.get(envio.polizaId);
    if (!p) {
      fallo("La póliza ya no existe o no es de tu cartera.");
      continue;
    }
    if (p.canceladaAt) {
      fallo("La póliza ya está cancelada en el CRM.");
      continue;
    }
    const email = p.cliente.email.trim();
    if (!emailValido(email)) {
      fallo("El cliente no tiene un correo válido.");
      continue;
    }

    const referencia_id = referenciaPrevio(p.id, fechas.ventanilla);
    try {
      await db.avisoEnviado.create({
        data: { agenciaId: user.agenciaId, tipo: TIPO_AVISO_PREVIO, referencia_id, destinatario: email },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        fallo("Ya se le envió el aviso de este mes.");
      } else {
        console.error("[previoCancelar] registro", e instanceof Error ? e.message : e);
        fallo("No se pudo registrar el envío.");
      }
      continue;
    }

    try {
      if (i > 0) await esperar(600); // Resend admite pocas solicitudes por segundo.
      const referencia = typeof envio.referencia === "string" ? envio.referencia.replace(/\s+/g, "").slice(0, 60) : "";
      const { asunto, titulo, mensaje } = mensajePrevioCancelar({
        ramo: ramoAviso(p.ramo),
        poliza: p.polizaVigor || p.numeroImpreso,
        aseguradora: p.aseguradora.nombre,
        fechaVentanilla: fechas.ventanilla,
        fechaPortal: fechas.portal,
        referencia: referencia || undefined,
        correoContacto: agencia.correoServicio ?? undefined,
      });
      const { html, texto } = await renderNotificacionCrm({
        nombreCrm: agencia.nombre,
        colorTema: agencia.colorHex ?? COLOR_MARCA_PREDETERMINADO,
        logoUrl: logoParaDocumentos(agencia),
        nombreUsuario: p.cliente.nombre,
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
        cco: cco.correos,
        responderA: agencia.correoServicio ?? undefined,
        modulo: "previo-cancelar",
      });
      if (r.ok) {
        resultados.push({ polizaId: p.id, ok: true, email });
        continue;
      }
      console.error("[previoCancelar]", p.id, r.error);
    } catch (e) {
      console.error("[previoCancelar]", p.id, e instanceof Error ? e.message : e);
    }
    // No salió: se borra el registro para que no cuente como enviado.
    await db.avisoEnviado
      .delete({ where: { tipo_referencia_id: { tipo: TIPO_AVISO_PREVIO, referencia_id } } })
      .catch(() => {});
    fallo("El servicio de correo no lo aceptó; inténtalo más tarde.");
  }
  return { ok: true, resultados };
}
