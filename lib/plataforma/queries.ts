import "server-only";

import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import { USUARIOS_DEL_PLAN } from "@/lib/planes/limites";
import { periodoDe, PLANES } from "@/lib/planes/planes";
import { estadoCobro } from "@/lib/plataforma/cobranza";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Cobranza de cada agencia para el panel del SUPERADMIN: su configuración, su estado de pago y
 * sus últimos pagos. Exige el rol aquí mismo (cruza agencias).
 */
export async function getCobranzaAgencias() {
  const user = await getCurrentUser();
  if (!user?.superadmin) return [];
  const hoy = hoyISO();
  const periodo = new Date(`${periodoDe(hoy)}T00:00:00Z`);
  const agencias = await db.agencia.findMany({
    orderBy: [{ createdAt: "asc" }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      suspendida: true,
      plan: true,
      cicloFacturacion: true,
      _count: { select: { usuarios: { where: USUARIOS_DEL_PLAN } } },
      usoOcr: { where: { periodo }, select: { escaneos: true } },
      cuotaMensual: true,
      pagadoHasta: true,
      diasToleranciaPago: true,
      suspensionAutomatica: true,
      correoFacturacion: true,
      pagosPlataforma: {
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        take: 6,
        select: { id: true, fecha: true, monto: true, cubreHasta: true, nota: true, registradoPor: true },
      },
    },
  });
  return agencias.map((a) => {
    const cobro = {
      cuotaMensual: a.cuotaMensual === null ? null : Number(a.cuotaMensual),
      pagadoHasta: iso(a.pagadoHasta),
      diasTolerancia: a.diasToleranciaPago,
    };
    const plan = PLANES[a.plan];
    return {
      id: a.id,
      nombre: a.nombre,
      suspendida: a.suspendida,
      plan: a.plan,
      ciclo: a.cicloFacturacion,
      usuarios: { usados: a._count.usuarios, limite: plan.usuarios },
      ocr: { usados: a.usoOcr[0]?.escaneos ?? 0, limite: plan.ocrMensual },
      suspensionAutomatica: a.suspensionAutomatica,
      correoFacturacion: a.correoFacturacion,
      ...cobro,
      ...estadoCobro(cobro, hoy),
      pagos: a.pagosPlataforma.map((p) => ({
        id: p.id,
        fecha: iso(p.fecha)!,
        monto: Number(p.monto),
        cubreHasta: iso(p.cubreHasta)!,
        nota: p.nota,
        registradoPor: p.registradoPor,
      })),
    };
  });
}
export type CobranzaAgencia = Awaited<ReturnType<typeof getCobranzaAgencias>>[number];

/** Estado de pago de la agencia de la sesión, para el aviso a sus administradores. */
export async function getEstadoPagoAgencia(agenciaId: string) {
  const a = await db.agencia.findUnique({
    where: { id: agenciaId },
    select: { cuotaMensual: true, pagadoHasta: true, diasToleranciaPago: true },
  });
  if (!a) return null;
  const pagadoHasta = iso(a.pagadoHasta);
  const cobro = estadoCobro(
    { cuotaMensual: a.cuotaMensual === null ? null : Number(a.cuotaMensual), pagadoHasta, diasTolerancia: a.diasToleranciaPago },
    hoyISO()
  );
  return { ...cobro, pagadoHasta };
}
