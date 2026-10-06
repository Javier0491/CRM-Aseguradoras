import "server-only";

import { connection } from "next/server";

import { getAlcance, polizasDe } from "@/lib/auth/alcance";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";

/**
 * Catálogo de aseguradoras con su cartera: pólizas activas (vigentes hoy), su prima y el
 * total histórico de pólizas. No expone credenciales ni notas de acceso.
 */
export async function getAseguradorasCatalogo() {
  await connection();
  const alcance = await getAlcance();
  const { agenciaId } = alcance;
  const hoy = new Date(`${hoyISO()}T00:00:00Z`);

  const [aseguradoras, activas, totales] = await Promise.all([
    db.aseguradora.findMany({
      where: { agenciaId },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        color_hex: true,
        url_portal_cobranza: true,
        estado_api: true,
        usaPolizaVigor: true,
        ignoraRecibosDuplicados: true,
        diasGracia: true,
      },
    }),
    db.poliza.groupBy({
      by: ["aseguradora_id"],
      // Activas: en vigencia hoy y no canceladas; de la cartera que ve la sesión.
      where: { ...polizasDe(alcance), canceladaAt: null, vigencia_inicio: { lte: hoy }, vigencia_fin: { gte: hoy } },
      _count: { _all: true },
      _sum: { prima_total: true },
    }),
    db.poliza.groupBy({ by: ["aseguradora_id"], where: polizasDe(alcance), _count: { _all: true } }),
  ]);

  const activasPor = new Map(activas.map((g) => [g.aseguradora_id, g]));
  const totalesPor = new Map(totales.map((g) => [g.aseguradora_id, g._count._all]));

  return aseguradoras
    .map((a) => ({
      ...a,
      polizasActivas: activasPor.get(a.id)?._count._all ?? 0,
      primaActiva: Number(activasPor.get(a.id)?._sum.prima_total ?? 0),
      polizasTotales: totalesPor.get(a.id) ?? 0,
    }))
    .sort((a, b) => b.polizasActivas - a.polizasActivas || a.nombre.localeCompare(b.nombre, "es"));
}
