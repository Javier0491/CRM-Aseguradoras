import "server-only";

import { mensajeAviso, type DatosAviso } from "@/lib/avisos/mensajes";
import { avisoDeRecibo, MAX_DIAS_AVISO, VENTANA_SEGUNDO_AVISO, type TipoAviso } from "@/lib/avisos/reglas";
import { COLOR_MARCA_PREDETERMINADO, logoParaDocumentos } from "@/lib/agencias/marca";
import { emailValido, enviarAviso } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";
import { renderNotificacionCrm } from "@/lib/emails/render";
import { Prisma } from "@/lib/generated/prisma/client";
import { hoyISO } from "@/lib/format";
import { sumarDias } from "@/lib/polizas/gracia";

/** Tope por ejecución (~0.6 s por correo): lo que no alcance sale en la siguiente. */
const MAX_POR_EJECUCION = 300;
const PAUSA_MS = 550;
/** Día (YYYY-MM-DD) en la zona horaria de la operación, para saber cuándo salió un aviso. */
const diaOperacion = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });

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
        // El segundo aviso sale a lo más MAX_DIAS_AVISO días después del primero, que a su vez
        // sale a lo más MAX_DIAS_AVISO días antes del vencimiento (o, sin primero, del vencimiento).
        fecha_vencimiento: {
          gte: fechaUtc(sumarDias(hoy, -(MAX_DIAS_AVISO + VENTANA_SEGUNDO_AVISO))),
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
        // Ni las canceladas ni las que el embudo ya da por perdidas reciben aviso de renovación.
        canceladaAt: null,
        OR: [{ renovacionEtapa: null }, { renovacionEtapa: { not: "PERDIDA" } }],
      },
      orderBy: { vigencia_fin: "asc" },
      select: { id: true, cadenaId: true, vigencia_fin: true, ...selectPoliza },
    }),
  ]);

  // Cuándo salió el primer aviso ("Próximo recibo a pagar") de cada recibo: el segundo se cuenta
  // desde ahí.
  const primeros = recibos.length
    ? await db.avisoEnviado.findMany({
        where: { agenciaId, tipo: "por_vencer", referencia_id: { in: recibos.map((r) => r.id) } },
        select: { referencia_id: true, created_at: true },
      })
    : [];
  const primerAviso = new Map(primeros.map((a) => [a.referencia_id, diaOperacion.format(a.created_at)]));

  const pendientes: Pendiente[] = [];
  for (const r of recibos) {
    const { aseguradora, cliente, numeroImpreso } = r.poliza;
    const vencimiento = iso(r.fecha_vencimiento);
    const tipo = avisoDeRecibo({
      vencimiento,
      hoy,
      primerAviso: primerAviso.get(r.id) ?? null,
      diasAntes: aseguradora.avisoDiasAntes,
      diasSegundo: aseguradora.avisoDiasVencido,
    });
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
        hoy,
      },
    });
  }

  // Renovaciones ya capturadas: otra póliza de la misma cadena que empieza cuando esta termina.
  const porRenovar = polizas.filter(
    (p) => iso(p.vigencia_fin) <= sumarDias(hoy, p.aseguradora.avisoDiasRenovacion ?? 0)
  );
  const idsCadena = [...new Set(porRenovar.map((p) => p.cadenaId))];
  const cadena = idsCadena.length
    ? await db.poliza.findMany({
        where: { agenciaId, cadenaId: { in: idsCadena } },
        select: { cadenaId: true, vigencia_inicio: true },
      })
    : [];
  for (const p of porRenovar) {
    const renovada = cadena.some((c) => c.cadenaId === p.cadenaId && c.vigencia_inicio >= p.vigencia_fin);
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
