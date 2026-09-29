import "server-only";

import {
  anioParaComision,
  comisionEsperada,
  edadDelTitular,
  primaNetaDelRecibo,
  resolverPorcentaje,
} from "@/lib/conciliacion/comisiones";
import { db } from "@/lib/db";
import type { FormaPago, Prisma } from "@/lib/generated/prisma/client";

/** Lo que necesita un recibo para calcular su comisión esperada. */
export const SELECT_RECIBO_ESPERADA = {
  id: true,
  numero: true,
  fecha_vencimiento: true,
  poliza: {
    select: {
      id: true,
      polizaVigor: true,
      aseguradora_id: true,
      ramo: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      forma_pago: true,
      prima_neta: true,
      comision_personalizada_pct: true,
      asegurados: { select: { parentesco: true, orden: true, edad: true, fecha_nacimiento: true, antiguedad: true } },
    },
  },
} satisfies Prisma.ReciboSelect;

type ReciboEsperada = Prisma.ReciboGetPayload<{ select: typeof SELECT_RECIBO_ESPERADA }>;

export type Esperada =
  | { esperada: number; porcentaje: number; anio: number | null }
  | { esperada: null; motivo: string };

/**
 * Comisión esperada de varios recibos con la misma regla que la conciliación: (prima neta ÷
 * número de recibos) × % personalizado o de la matriz (aseguradora, ramo, año y edad).
 */
export async function comisionesEsperadas(
  agenciaId: string,
  recibos: readonly ReciboEsperada[]
): Promise<Map<string, Esperada>> {
  const resultado = new Map<string, Esperada>();
  if (recibos.length === 0) return resultado;

  const aseguradoras = [...new Set(recibos.map((r) => r.poliza.aseguradora_id))];
  const vigores = [...new Set(recibos.map((r) => r.poliza.polizaVigor).filter((v): v is string => Boolean(v)))];
  const [esquemas, cadenas] = await Promise.all([
    db.esquemaComision.findMany({
      where: { agenciaId, aseguradora_id: { in: aseguradoras } },
      select: { aseguradora_id: true, ramo: true, anio_poliza: true, porcentaje: true, edad_minima: true, edad_maxima: true },
    }),
    vigores.length
      ? db.poliza.groupBy({
          by: ["aseguradora_id", "polizaVigor"],
          where: { agenciaId, polizaVigor: { in: vigores }, aseguradora_id: { in: aseguradoras } },
          _min: { vigencia_inicio: true },
        })
      : Promise.resolve([]),
  ]);
  const primera = new Map(cadenas.map((c) => [`${c.aseguradora_id}|${c.polizaVigor}`, c._min.vigencia_inicio]));

  for (const r of recibos) {
    const p = r.poliza;
    const { anio } = anioParaComision({
      asegurados: p.asegurados,
      vigenciaInicio: p.vigencia_inicio,
      primeraVigencia: (p.polizaVigor && primera.get(`${p.aseguradora_id}|${p.polizaVigor}`)) || p.vigencia_inicio,
      fechaRecibo: r.fecha_vencimiento,
    });
    const porcentaje = resolverPorcentaje(
      {
        personalizado: p.comision_personalizada_pct !== null ? Number(p.comision_personalizada_pct) : null,
        ramo: p.ramo,
      },
      anio,
      edadDelTitular(p.asegurados, r.fecha_vencimiento),
      esquemas
        .filter((e) => e.aseguradora_id === p.aseguradora_id)
        .map((e) => ({ ...e, porcentaje: Number(e.porcentaje) }))
    );
    if (!porcentaje) {
      resultado.set(r.id, { esperada: null, motivo: `Sin regla en la matriz (año ${anio})` });
      continue;
    }
    const base = primaNetaDelRecibo({ ...p, forma_pago: p.forma_pago as FormaPago }, r.numero);
    if (!base) {
      resultado.set(r.id, { esperada: null, motivo: "La póliza no tiene prima neta" });
      continue;
    }
    resultado.set(r.id, {
      esperada: comisionEsperada(base.primaNeta, porcentaje.valor),
      porcentaje: porcentaje.valor,
      anio: porcentaje.anio,
    });
  }
  return resultado;
}
