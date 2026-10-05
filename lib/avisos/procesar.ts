import "server-only";

import { mensajeAviso, type DatosAviso } from "@/lib/avisos/mensajes";
import { MAX_DIAS_AVISO, type TipoAviso } from "@/lib/avisos/reglas";
import { COLOR_MARCA_PREDETERMINADO, logoParaDocumentos } from "@/lib/agencias/marca";
import { emailValido, enviarAviso } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { Prisma } from "@/lib/generated/prisma/client";
import { hoyISO } from "@/lib/format";
import { sumarDias } from "@/lib/polizas/gracia";

/** Tope por ejecución (~0.6 s por correo): lo que no alcance sale en la siguiente. */
const MAX_POR_EJECUCION = 300;
/**
 * Un recibo vencido solo se avisa durante esta ventana después de cumplir sus días: al activar
 * la matriz no se reclaman recibos vencidos hace meses.
 */
const VENTANA_VENCIDO = 7;
const PAUSA_MS = 550;

type Pendiente = { tipo: TipoAviso; referenciaId: string; email: string; datos: DatosAviso };

const fechaUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Avisos que le tocan hoy a una agencia según su matriz (sin descontar los ya enviados). */
async function avisosDeAgencia(agenciaId: string, hoy: string): Promise<Pendiente[]> {
  const selectPoliza = {
    numeroImpreso: true,
    cliente: { select: { nombre: true, email: true } },
    aseguradora: {
      select: { nombre: true, diasGracia: true, avisoDiasAntes: true, avisoDiasVencido: true, avisoDiasRenovacion: true },
    },
  } as const;

  const [recibos, polizas] = await Promise.all([
    db.recibo.findMany({
      where: {
        agenciaId,
        estado: "PENDIENTE",
        fecha_vencimiento: {
          gte: fechaUtc(sumarDias(hoy, -(MAX_DIAS_AVISO + VENTANA_VENCIDO))),
          lte: fechaUtc(sumarDias(hoy, MAX_DIAS_AVISO)),
        },
        poliza: { aseguradora: { OR: [{ avisoDiasAntes: { not: null } }, { avisoDiasVencido: { not: null } }] } },
      },
      orderBy: { fecha_vencimiento: "asc" },
      select: { id: true, numero: true, monto: true, fecha_vencimiento: true, poliza: { select: selectPoliza } },
    }),
    db.poliza.findMany({
      where: {
        agenciaId,
        vigencia_fin: { gte: fechaUtc(hoy), lte: fechaUtc(sumarDias(hoy, MAX_DIAS_AVISO)) },
        aseguradora: { avisoDiasRenovacion: { not: null } },
      },
      orderBy: { vigencia_fin: "asc" },
      select: { id: true, polizaVigor: true, aseguradora_id: true, vigencia_fin: true, ...selectPoliza },
    }),
  ]);

  const pendientes: Pendiente[] = [];
  for (const r of recibos) {
    const { aseguradora, cliente, numeroImpreso } = r.poliza;
    const vencimiento = iso(r.fecha_vencimiento);
    let tipo: TipoAviso | null = null;
    if (vencimiento >= hoy) {
      if (aseguradora.avisoDiasAntes !== null && vencimiento <= sumarDias(hoy, aseguradora.avisoDiasAntes)) tipo = "por_vencer";
    } else if (aseguradora.avisoDiasVencido !== null) {
      const desde = sumarDias(vencimiento, aseguradora.avisoDiasVencido);
      if (hoy >= desde && hoy <= sumarDias(desde, VENTANA_VENCIDO)) tipo = "vencido";
    }
    if (!tipo) continue;
    pendientes.push({
      tipo,
      referenciaId: r.id,
      email: cliente.email.trim(),
      datos: {
        cliente: cliente.nombre,
        poliza: numeroImpreso,
        aseguradora: aseguradora.nombre,
        fecha: vencimiento,
        monto: Number(r.monto),
        numeroRecibo: r.numero,
        diasGracia: aseguradora.diasGracia,
      },
    });
  }

  // Renovaciones ya capturadas: otra póliza de la misma cadena que empieza cuando esta termina.
  const porRenovar = polizas.filter(
    (p) => iso(p.vigencia_fin) <= sumarDias(hoy, p.aseguradora.avisoDiasRenovacion ?? 0)
  );
  const vigores = [...new Set(porRenovar.flatMap((p) => (p.polizaVigor ? [p.polizaVigor] : [])))];
  const cadena = vigores.length
    ? await db.poliza.findMany({
        where: { agenciaId, polizaVigor: { in: vigores } },
        select: { polizaVigor: true, aseguradora_id: true, vigencia_inicio: true },
      })
    : [];
  for (const p of porRenovar) {
    const renovada = cadena.some(
      (c) => c.polizaVigor === p.polizaVigor && c.aseguradora_id === p.aseguradora_id && c.vigencia_inicio >= p.vigencia_fin
    );
    if (renovada) continue;
    pendientes.push({
      tipo: "renovacion",
      referenciaId: p.id,
      email: p.cliente.email.trim(),
      datos: { cliente: p.cliente.nombre, poliza: p.numeroImpreso, aseguradora: p.aseguradora.nombre, fecha: iso(p.vigencia_fin) },
    });
  }
  return pendientes;
}

export type ResumenAvisos = { enviados: number; fallidos: number; sinCorreo: number; pendientes: number };

/**
 * Envía los avisos automáticos del día de todas las agencias (lo llama la tarea programada).
 * Cada aviso se registra en `avisos_enviados` antes de enviarse, así dos ejecuciones no lo
 * duplican; si el envío falla, el registro se borra y se reintenta en la siguiente ejecución.
 */
export async function procesarAvisos(): Promise<ResumenAvisos> {
  const hoy = hoyISO();
  const resumen: ResumenAvisos = { enviados: 0, fallidos: 0, sinCorreo: 0, pendientes: 0 };
  const agencias = await db.agencia.findMany({
    where: {
      // Una agencia suspendida no envía avisos a sus clientes.
      suspendida: false,
      // Sin correo de copia no sale ningún aviso: las respuestas del cliente llegarían al
      // remitente universal en vez de a la agencia.
      correoCopiaAvisos: { not: null },
      aseguradoras: {
        some: {
          OR: [
            { avisoDiasAntes: { not: null } },
            { avisoDiasVencido: { not: null } },
            { avisoDiasRenovacion: { not: null } },
          ],
        },
      },
    },
    select: { id: true, nombre: true, colorHex: true, logoUrl: true, logoDocumentosUrl: true, correoCopiaAvisos: true },
  });

  let primero = true;
  for (const agencia of agencias) {
    const candidatos = await avisosDeAgencia(agencia.id, hoy);
    if (candidatos.length === 0) continue;
    const yaEnviados = await db.avisoEnviado.findMany({
      where: { agenciaId: agencia.id, referencia_id: { in: candidatos.map((c) => c.referenciaId) } },
      select: { tipo: true, referencia_id: true },
    });
    const enviados = new Set(yaEnviados.map((a) => `${a.tipo}|${a.referencia_id}`));

    for (const aviso of candidatos) {
      if (enviados.has(`${aviso.tipo}|${aviso.referenciaId}`)) continue;
      if (!emailValido(aviso.email)) {
        resumen.sinCorreo++;
        continue;
      }
      if (resumen.enviados + resumen.fallidos >= MAX_POR_EJECUCION) {
        resumen.pendientes++;
        continue;
      }

      const where = { tipo_referencia_id: { tipo: aviso.tipo, referencia_id: aviso.referenciaId } };
      try {
        await db.avisoEnviado.create({
          data: { agenciaId: agencia.id, tipo: aviso.tipo, referencia_id: aviso.referenciaId, destinatario: aviso.email },
        });
      } catch (e) {
        // Otra ejecución lo tomó al mismo tiempo.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }

      if (!primero) await new Promise((r) => setTimeout(r, PAUSA_MS));
      primero = false;
      let ok = false;
      try {
        const { asunto, titulo, mensaje } = mensajeAviso(aviso.tipo, {
          ...aviso.datos,
          correoContacto: agencia.correoCopiaAvisos ?? undefined,
        });
        // Sin urlDetalles: el botón "Ver detalles" no aparece y el cliente solo lee el aviso.
        const { html, texto } = await renderNotificacionCrm({
          nombreCrm: agencia.nombre,
          colorTema: agencia.colorHex ?? COLOR_MARCA_PREDETERMINADO,
          logoUrl: logoParaDocumentos(agencia),
          nombreUsuario: aviso.datos.cliente,
          tituloNotificacion: titulo,
          mensajePrincipal: mensaje,
        });
        const resultado = await enviarAviso({
          agencia: agencia.nombre,
          para: aviso.email,
          asunto,
          html,
          texto,
          copia: agencia.correoCopiaAvisos ?? undefined,
        });
        ok = resultado.ok;
        if (!ok) console.error("[avisos]", aviso.tipo, aviso.referenciaId, resultado.error);
      } catch (e) {
        // Resend sin configurar o con la llave inválida: no tiene caso seguir.
        await db.avisoEnviado.delete({ where });
        throw e;
      }
      if (ok) resumen.enviados++;
      else {
        resumen.fallidos++;
        await db.avisoEnviado.delete({ where });
      }
    }
  }
  return resumen;
}
