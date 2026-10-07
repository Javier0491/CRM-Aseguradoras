import "server-only";

import { cruzarFilas } from "@/lib/conciliacion/cruce";
import type { FilaEstado, ResultadoMatch } from "@/lib/conciliacion/tipos";
import { polizasDe, type Alcance } from "@/lib/auth/alcance";
import type { UsuarioSesion } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { extraerPolizaVigor } from "@/lib/polizas/polizaParser";

/**
 * Cruza los renglones de un estado de cuenta contra las pólizas y recibos de la aseguradora.
 * No modifica nada: `aplicarConciliacion` vuelve a cruzar y aplica el resultado.
 *
 * - La póliza del archivo se busca por póliza vigor (la llave de cobranza) o por número impreso.
 * - El recibo se busca por folio; si no, por número de recibo; si no, el más antiguo aún no
 *   conciliado. Nunca se repite: dos renglones de la misma póliza pagan recibos distintos.
 * - Comisión esperada = (prima neta de la vigencia ÷ número de recibos) × % (personalizado de
 *   la póliza o el de la matriz según aseguradora, ramo, año de la póliza y edad del titular).
 *   El año sale de la fecha de antigüedad del titular; sin ella, de la primera vigencia de la
 *   cadena registrada en el CRM (ver anioParaComision).
 *   Nunca sobre la prima total ni el monto cobrado del recibo.
 * - El estado de cuenta es la fuente de la verdad de lo cobrado: si la póliza existe pero el
 *   recibo no, se propone crearlo ya conciliado ("auto_creado"). Solo cuando el renglón trae
 *   folio o número de recibo, para no duplicar recibos al reprocesar un archivo.
 * - Solo cruza las pólizas que ve la sesión (`alcance`): un ejecutivo con "cartera por
 *   ejecutivo" concilia las suyas y el resto de los renglones queda como no encontrado.
 */
export async function cruzarEstadoDeCuenta(alcance: Alcance, aseguradoraId: string, filas: readonly FilaEstado[]) {
  const { agenciaId } = alcance;
  const vigores = [...new Set(filas.map((f) => extraerPolizaVigor(f.poliza)).filter(Boolean))];
  const impresos = [...new Set(filas.map((f) => f.poliza.trim().toUpperCase()).filter(Boolean))];

  // Sin póliza vigor (p. ej. Quálitas) el renglón se cruza solo por el número impreso completo.
  const { usaPolizaVigor } = await db.aseguradora.findUniqueOrThrow({
    where: { id: aseguradoraId, agenciaId },
    select: { usaPolizaVigor: true },
  });

  const [polizas, esquemas] = await Promise.all([
    db.poliza.findMany({
      where: {
        ...polizasDe(alcance),
        aseguradora_id: aseguradoraId,
        OR: usaPolizaVigor
          ? [{ polizaVigor: { in: vigores } }, { numeroImpreso: { in: impresos } }]
          : [{ numeroImpreso: { in: impresos } }],
      },
      // De la más antigua a la más reciente: la última de una cadena es la vigente.
      orderBy: { vigencia_inicio: "asc" },
      select: {
        id: true,
        numeroImpreso: true,
        polizaVigor: true,
        cadenaId: true,
        ramo: true,
        vigencia_inicio: true,
        vigencia_fin: true,
        prima_total: true,
        prima_neta: true,
        forma_pago: true,
        comision_personalizada_pct: true,
        cliente: { select: { nombre: true } },
        asegurados: {
          select: { parentesco: true, orden: true, edad: true, fecha_nacimiento: true, antiguedad: true },
        },
        recibos: {
          orderBy: { fecha_vencimiento: "asc" },
          select: { id: true, numero: true, monto: true, fecha_vencimiento: true, estado: true, folio: true },
        },
      },
    }),
    db.esquemaComision.findMany({
      where: { agenciaId, aseguradora_id: aseguradoraId },
      select: { ramo: true, anio_poliza: true, porcentaje: true, edad_minima: true, edad_maxima: true },
    }),
  ]);
  // Primera vigencia de cada cadena (misma póliza vigor) para distinguir año 1 de renovación.
  // Se consulta toda la cadena en la base de datos, no solo las vigencias que menciona el
  // archivo: si el estado de cuenta nombra la renovación por su número impreso, sus vigencias
  // anteriores no vienen entre `polizas` y la renovación se contaría como año 1.
  const idsCadena = [...new Set(polizas.map((p) => p.cadenaId))];
  const cadenas = idsCadena.length
    ? await db.poliza.groupBy({
        by: ["cadenaId"],
        where: { agenciaId, cadenaId: { in: idsCadena } },
        _min: { vigencia_inicio: true },
      })
    : [];
  const primerasVigencias = new Map<string, Date>();
  for (const c of cadenas) if (c._min.vigencia_inicio) primerasVigencias.set(c.cadenaId, c._min.vigencia_inicio);

  return cruzarFilas({
    filas,
    usaPolizaVigor,
    polizas,
    esquemas: esquemas.map((e) => ({ ...e, porcentaje: Number(e.porcentaje) })),
    primerasVigencias,
  });
}

/**
 * Escribe un cruce en una sola transacción. El estado de cuenta es la fuente de la verdad de lo
 * cobrado, así que todo recibo que reporta avanza en la póliza:
 * - conciliado: CONCILIADO (cobrado y comisión correcta).
 * - diferencia: PAGADO (cobrado, pero la comisión no coincide y queda por aclarar).
 * - auto_creado: se crea ya CONCILIADO.
 * En todos se guarda la comisión pagada y el folio del archivo. Todo queda en un lote con el
 * estado anterior de cada recibo, para poder revertirlo (revertirLote), y en la bitácora.
 * No verifica sesión: quien la invoque (Server Action) debe hacerlo.
 */
export async function aplicarResultados(
  resultados: readonly ResultadoMatch[],
  {
    aseguradoraId,
    archivoNombre,
    usuario,
  }: { aseguradoraId: string; archivoNombre: string; usuario: UsuarioSesion }
) {
  const { agenciaId } = usuario;
  const conciliar = resultados.filter((r) => r.estatus === "conciliado" && r.recibo);
  const pagar = resultados.filter((r) => r.estatus === "diferencia" && r.recibo);
  const crear = resultados.filter((r) => r.estatus === "auto_creado" && r.nuevoRecibo);
  // Lo que no se pudo aplicar se guarda para explicar en Pólizas → Sin conciliar por qué no se concilió.
  const sinConciliar = resultados.filter((r) => r.estatus === "no_encontrado" || r.estatus === "revisar");
  if (conciliar.length === 0 && pagar.length === 0 && crear.length === 0 && sinConciliar.length === 0) {
    return { loteId: null, conciliados: 0, pagados: 0, creados: 0 };
  }

  const ahora = new Date();
  return db.$transaction(
    async (tx) => {
      // Estado de los recibos antes de tocarlos: es lo que restaura revertirLote.
      const antes = new Map(
        (
          await tx.recibo.findMany({
            where: { agenciaId, id: { in: [...conciliar, ...pagar].map((r) => r.recibo!.id) } },
            select: { id: true, estado: true, comision_pagada: true, folio: true, conciliado_at: true },
          })
        ).map((r) => [r.id, r])
      );
      type Cambio = Omit<Prisma.LoteCambioCreateManyInput, "lote_id" | "agenciaId">;
      const cambios: Cambio[] = [];

      let conciliados = 0;
      let pagados = 0;
      const porAplicar = [
        ...conciliar.map((r) => ({ r, estado: "CONCILIADO" as const })),
        ...pagar.map((r) => ({ r, estado: "PAGADO" as const })),
      ];
      for (const { r, estado } of porAplicar) {
        const previo = antes.get(r.recibo!.id);
        // El filtro por estado evita conciliar dos veces si otra persona lo hizo en paralelo.
        const { count } = await tx.recibo.updateMany({
          where: { agenciaId, id: r.recibo!.id, estado: { not: "CONCILIADO" } },
          data: {
            estado,
            comision_pagada: r.comisionPagada.toFixed(2),
            ...(estado === "CONCILIADO" && { conciliado_at: ahora }),
            ...(r.folio && { folio: r.folio }),
          },
        });
        if (count === 0 || !previo) continue;
        if (estado === "CONCILIADO") conciliados++;
        else pagados++;
        cambios.push({
          recibo_id: r.recibo!.id,
          tipo: estado === "CONCILIADO" ? "conciliado" : "pagado",
          fila: r.fila,
          poliza_numero: r.poliza?.numeroImpreso ?? r.polizaArchivo,
          recibo_numero: r.recibo!.numero,
          estado_anterior: previo.estado,
          comision_anterior: previo.comision_pagada,
          folio_anterior: previo.folio,
          conciliado_at_anterior: previo.conciliado_at,
          estado_nuevo: estado,
          comision_nueva: r.comisionPagada.toFixed(2),
        });
      }

      const creadosDb = crear.length
        ? await tx.recibo.createManyAndReturn({
            data: crear.map((r) => {
              const n = r.nuevoRecibo!;
              return {
                agenciaId,
                poliza_id: n.polizaId,
                numero: n.numero,
                monto: n.monto,
                fecha_vencimiento: new Date(`${n.fecha}T00:00:00Z`),
                estado: "CONCILIADO" as const,
                comision_pagada: r.comisionPagada.toFixed(2),
                conciliado_at: ahora,
                folio: n.folio,
                auto_creado: true,
              };
            }),
            select: { id: true, poliza_id: true, numero: true },
          })
        : [];
      const idCreado = new Map(creadosDb.map((c) => [`${c.poliza_id}|${c.numero}`, c.id]));
      for (const r of crear) {
        const n = r.nuevoRecibo!;
        cambios.push({
          recibo_id: idCreado.get(`${n.polizaId}|${n.numero}`) ?? null,
          tipo: "creado",
          fila: r.fila,
          poliza_numero: r.poliza?.numeroImpreso ?? r.polizaArchivo,
          recibo_numero: n.numero,
          estado_nuevo: "CONCILIADO",
          comision_nueva: r.comisionPagada.toFixed(2),
        });
      }
      const creados = creadosDb.length;

      const lote = await tx.loteConciliacion.create({
        data: {
          agenciaId,
          aseguradora_id: aseguradoraId,
          usuario_id: usuario.id,
          usuario_email: usuario.email,
          archivo_nombre: archivoNombre,
          renglones: resultados.length,
          conciliados,
          pagados,
          creados,
        },
        select: { id: true, aseguradora: { select: { nombre: true } } },
      });
      if (cambios.length) {
        await tx.loteCambio.createMany({ data: cambios.map((c) => ({ ...c, agenciaId, lote_id: lote.id })) });
      }
      if (sinConciliar.length) {
        await tx.loteRenglon.createMany({
          data: sinConciliar.map((r) => ({
            agenciaId,
            lote_id: lote.id,
            fila: r.fila,
            poliza_archivo: r.polizaArchivo,
            estatus: r.estatus,
            detalle: r.detalle,
            comision_pagada: r.comisionPagada.toFixed(2),
            folio: r.folio,
            poliza_id: r.poliza?.id ?? null,
          })),
        });
      }
      await registrarBitacora(
        usuario,
        {
          accion: "conciliacion.aplicar",
          entidad: "lote",
          entidadId: lote.id,
          descripcion:
            `Aplicó «${archivoNombre}» de ${lote.aseguradora.nombre}: ${conciliados} conciliados, ` +
            `${pagados} pagados con diferencia y ${creados} auto-creados` +
            (sinConciliar.length ? `; ${sinConciliar.length} renglones sin conciliar` : ""),
        },
        tx
      );
      return { loteId: lote.id, conciliados, pagados, creados };
    },
    // Un archivo grande actualiza cientos de recibos: más margen que los 5 s por omisión.
    { maxWait: 10_000, timeout: 60_000 }
  );
}

export class LoteNoReversibleError extends Error {}

/**
 * Revierte un lote de conciliación: borra los recibos que creó y devuelve los demás a su estado
 * anterior (estado, comisión pagada, folio y fecha de conciliación). Solo si nada se movió
 * después: otro lote posterior no revertido que tocó los mismos recibos, o un recibo que cambió
 * por una aclaración, bloquean la reversión para no pisar ese trabajo.
 */
export async function revertirLote(loteId: string, usuario: UsuarioSesion) {
  const { agenciaId } = usuario;
  return db.$transaction(
    async (tx) => {
      const clave = `lote:${loteId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`;
      const lote = await tx.loteConciliacion.findUnique({
        where: { id: loteId, agenciaId },
        select: {
          id: true,
          created_at: true,
          archivo_nombre: true,
          revertido_at: true,
          aseguradora: { select: { nombre: true } },
          cambios: true,
        },
      });
      if (!lote) throw new LoteNoReversibleError("El lote ya no existe.");
      if (lote.revertido_at) throw new LoteNoReversibleError("Este lote ya se había revertido.");

      const vivos = lote.cambios.filter((c) => c.recibo_id !== null);
      const ids = vivos.map((c) => c.recibo_id!);

      const posteriores = await tx.loteCambio.findMany({
        where: {
          agenciaId,
          recibo_id: { in: ids },
          lote_id: { not: lote.id },
          lote: { revertido_at: null, created_at: { gt: lote.created_at } },
        },
        select: { lote_id: true, lote: { select: { archivo_nombre: true } } },
        distinct: ["lote_id"],
      });
      if (posteriores.length > 0) {
        throw new LoteNoReversibleError(
          `Primero revierte ${posteriores.length === 1 ? "el lote posterior" : "los lotes posteriores"} que tocó los mismos recibos: ` +
            posteriores.map((p) => `«${p.lote.archivo_nombre}»`).join(", ") +
            "."
        );
      }

      const actuales = new Map(
        (
          await tx.recibo.findMany({
            where: { agenciaId, id: { in: ids } },
            select: { id: true, estado: true, comision_pagada: true, auto_creado: true },
          })
        ).map((r) => [r.id, r])
      );
      const cambiados = vivos.filter((c) => {
        const r = actuales.get(c.recibo_id!);
        return r && (r.estado !== c.estado_nuevo || r.comision_pagada?.toFixed(2) !== c.comision_nueva.toFixed(2));
      });
      if (cambiados.length > 0) {
        throw new LoteNoReversibleError(
          "Estos recibos cambiaron después de aplicar el lote (p. ej. por una aclaración): " +
            cambiados.map((c) => `${c.poliza_numero} recibo ${c.recibo_numero}`).join(", ") +
            ". Revísalos antes de revertir."
        );
      }

      let restaurados = 0;
      let borrados = 0;
      for (const c of vivos) {
        const r = actuales.get(c.recibo_id!);
        if (!r) continue; // Se borró por otra vía (p. ej. se eliminó la póliza).
        if (c.tipo === "creado") {
          if (!r.auto_creado) continue;
          await tx.recibo.delete({ where: { id: c.recibo_id!, agenciaId } });
          borrados++;
        } else {
          await tx.recibo.update({
            where: { id: c.recibo_id!, agenciaId },
            data: {
              estado: c.estado_anterior ?? "PENDIENTE",
              comision_pagada: c.comision_anterior,
              folio: c.folio_anterior,
              conciliado_at: c.conciliado_at_anterior,
            },
          });
          restaurados++;
        }
      }

      await tx.loteConciliacion.update({
        where: { id: lote.id, agenciaId },
        data: { revertido_at: new Date(), revertido_por: usuario.email },
      });
      await registrarBitacora(
        usuario,
        {
          accion: "conciliacion.revertir",
          entidad: "lote",
          entidadId: lote.id,
          descripcion:
            `Revirtió «${lote.archivo_nombre}» de ${lote.aseguradora.nombre}: ${restaurados} recibos restaurados ` +
            `y ${borrados} auto-creados eliminados`,
        },
        tx
      );
      return { restaurados, borrados };
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
}
