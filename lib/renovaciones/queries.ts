import "server-only";

import { connection } from "next/server";

import { getAlcance, polizasDe, type Alcance } from "@/lib/auth/alcance";
import { db } from "@/lib/db";
import { diasDesdeHoy, hoyISO } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";
import { NO_CANCELADA } from "@/lib/polizas/queries";
import {
  columnaDe,
  COLUMNAS_EMBUDO,
  DIAS_EMBUDO,
  DIAS_SEGUIMIENTO,
  DIAS_VENCIDAS_EMBUDO,
  type ColumnaEmbudo,
} from "@/lib/renovaciones/reglas";

const DIA_MS = 86_400_000;
const fechaUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Eslabon = { id: string; cadenaId: string; vigencia_fin: Date };

/**
 * Renovación ya capturada de cada póliza: otra de su cadena de renovaciones que empieza cuando
 * la anterior termina. Se busca en toda la agencia: la renovación puede estar en la cartera de
 * otro ejecutivo.
 */
export async function renovacionesDe(agenciaId: string, polizas: readonly Eslabon[]) {
  const cadenas = [...new Set(polizas.map((p) => p.cadenaId))];
  const cadena = cadenas.length
    ? await db.poliza.findMany({
        where: { agenciaId, cadenaId: { in: cadenas } },
        orderBy: { vigencia_inicio: "asc" },
        select: { id: true, numeroImpreso: true, cadenaId: true, vigencia_inicio: true },
      })
    : [];
  const resultado = new Map<string, { id: string; numeroImpreso: string } | null>();
  for (const p of polizas) {
    const r = cadena.find((c) => c.id !== p.id && c.cadenaId === p.cadenaId && c.vigencia_inicio >= p.vigencia_fin);
    resultado.set(p.id, r ? { id: r.id, numeroImpreso: r.numeroImpreso } : null);
  }
  return resultado;
}

/** Pólizas del embudo: vencen en la ventana o siguen en seguimiento; nunca las canceladas. */
function whereEmbudo(alcance: Alcance, hoy: string, ejecutivo?: string): Prisma.PolizaWhereInput {
  const hoyMs = fechaUtc(hoy).getTime();
  return {
    AND: [
      polizasDe(alcance),
      NO_CANCELADA,
      ejecutivo ? { ejecutivoId: ejecutivo === "sin" ? null : ejecutivo } : {},
      {
        OR: [
          {
            vigencia_fin: {
              gte: new Date(hoyMs - DIAS_VENCIDAS_EMBUDO * DIA_MS),
              lte: new Date(hoyMs + DIAS_EMBUDO * DIA_MS),
            },
          },
          { renovacionEtapa: { not: null }, vigencia_fin: { gte: new Date(hoyMs - DIAS_SEGUIMIENTO * DIA_MS) } },
        ],
      },
    ],
  };
}

export type TarjetaEmbudo = Awaited<ReturnType<typeof getEmbudo>>["columnas"][number]["polizas"][number];

/**
 * Tablero de renovaciones: cada póliza en su columna (ver columnaDe) con los días que faltan para
 * su fin de vigencia. `ejecutivo` filtra por responsable (id o "sin").
 */
export async function getEmbudo({ ejecutivo }: { ejecutivo?: string } = {}) {
  await connection();
  const alcance = await getAlcance();
  const hoy = hoyISO();
  const polizas = await db.poliza.findMany({
    where: whereEmbudo(alcance, hoy, ejecutivo?.slice(0, 64)),
    orderBy: [{ vigencia_fin: "asc" }, { numeroImpreso: "asc" }],
    take: 500,
    select: {
      id: true,
      numeroImpreso: true,
      polizaVigor: true,
      cadenaId: true,
      aseguradora_id: true,
      ramo: true,
      vigencia_fin: true,
      prima_total: true,
      renovacionEtapa: true,
      renovacionNota: true,
      renovacionEtapaAt: true,
      ejecutivo: { select: { nombre: true } },
      cliente: { select: { id: true, nombre: true, telefono: true, email: true } },
      aseguradora: { select: { nombre: true, color_hex: true } },
    },
  });
  const renovaciones = await renovacionesDe(alcance.agenciaId, polizas);
  const desdeRenovadas = fechaUtc(hoy).getTime() - DIAS_VENCIDAS_EMBUDO * DIA_MS;

  const tarjetas = polizas
    .map((p) => {
      const renovacion = renovaciones.get(p.id) ?? null;
      return {
        ...p,
        prima_total: Number(p.prima_total),
        renovacion,
        dias: diasDesdeHoy(p.vigencia_fin, hoy),
        columna: columnaDe({ renovada: renovacion !== null, etapa: p.renovacionEtapa }),
      };
    })
    // Las renovadas solo interesan dentro de la ventana; las perdidas, mientras estén en seguimiento.
    .filter((t) => t.columna !== "renovada" || t.vigencia_fin.getTime() >= desdeRenovadas);

  const columnas = COLUMNAS_EMBUDO.map((c) => {
    const deColumna = tarjetas.filter((t) => t.columna === c.clave);
    return { ...c, polizas: deColumna, prima: deColumna.reduce((s, t) => s + t.prima_total, 0) };
  });
  return { hoy, columnas, total: tarjetas.length };
}

/**
 * Renovaciones que requieren atención en los próximos `dias`: sin renovación capturada, no
 * perdidas ni canceladas. `sinGestionar` son las que aún no tienen etapa.
 */
export async function contarPorRenovar(alcance: Alcance, dias = 30) {
  const hoy = fechaUtc(hoyISO());
  const polizas = await db.poliza.findMany({
    where: {
      AND: [
        polizasDe(alcance),
        NO_CANCELADA,
        { OR: [{ renovacionEtapa: null }, { renovacionEtapa: { not: "PERDIDA" } }] },
        { vigencia_fin: { gte: hoy, lte: new Date(hoy.getTime() + dias * DIA_MS) } },
      ],
    },
    select: { id: true, cadenaId: true, vigencia_fin: true, renovacionEtapa: true },
  });
  const renovaciones = await renovacionesDe(alcance.agenciaId, polizas);
  const pendientes = polizas.filter((p) => !renovaciones.get(p.id));
  return { total: pendientes.length, sinGestionar: pendientes.filter((p) => p.renovacionEtapa === null).length };
}

export type { ColumnaEmbudo };
