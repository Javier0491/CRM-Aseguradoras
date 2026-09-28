import "server-only";

import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import { DIAS_POR_VENCER } from "@/lib/polizas/queries";

export type ResultadoBusqueda = {
  tipo: "cliente" | "poliza" | "recibo";
  id: string;
  titulo: string;
  detalle: string;
  href: string;
};

const POR_TIPO = 5;

/**
 * Búsqueda global del encabezado: clientes (nombre, RFC, teléfono o correo), pólizas (número,
 * póliza vigor o nombre del cliente) y recibos (folio de la aseguradora).
 */
export async function buscarGlobal(q: string): Promise<ResultadoBusqueda[]> {
  const texto = q.trim().slice(0, 60);
  if (texto.length < 2) return [];
  const contiene = { contains: texto, mode: "insensitive" as const };

  const [clientes, polizas, recibos] = await Promise.all([
    db.cliente.findMany({
      where: { OR: [{ nombre: contiene }, { rfc: contiene }, { telefono: contiene }, { email: contiene }] },
      orderBy: { nombre: "asc" },
      take: POR_TIPO,
      select: { id: true, nombre: true, rfc: true, _count: { select: { polizas: true } } },
    }),
    db.poliza.findMany({
      where: { OR: [{ numeroImpreso: contiene }, { polizaVigor: contiene }, { cliente: { nombre: contiene } }] },
      orderBy: { vigencia_fin: "desc" },
      take: POR_TIPO,
      select: {
        id: true,
        numeroImpreso: true,
        cliente: { select: { nombre: true } },
        aseguradora: { select: { nombre: true } },
      },
    }),
    db.recibo.findMany({
      where: { folio: contiene },
      take: POR_TIPO,
      select: {
        id: true,
        numero: true,
        folio: true,
        estado: true,
        poliza: { select: { id: true, numeroImpreso: true, cliente: { select: { nombre: true } } } },
      },
    }),
  ]);

  return [
    ...clientes.map((c) => ({
      tipo: "cliente" as const,
      id: c.id,
      titulo: c.nombre,
      detalle: `${c.rfc} · ${c._count.polizas} ${c._count.polizas === 1 ? "póliza" : "pólizas"}`,
      href: `/clientes/${c.id}`,
    })),
    ...polizas.map((p) => ({
      tipo: "poliza" as const,
      id: p.id,
      titulo: p.numeroImpreso,
      detalle: `${p.cliente.nombre} · ${p.aseguradora.nombre}`,
      href: `/polizas/${p.id}`,
    })),
    ...recibos.map((r) => ({
      tipo: "recibo" as const,
      id: r.id,
      titulo: `Folio ${r.folio}`,
      detalle: `Recibo ${r.numero} de la póliza ${r.poliza.numeroImpreso} · ${r.poliza.cliente.nombre} · ${r.estado.toLowerCase()}`,
      href: `/polizas/${r.poliza.id}`,
    })),
  ];
}

export type Aviso = { clave: string; titulo: string; detalle: string; cantidad: number; href: string; tono: "warning" | "destructive" | "info" };

/**
 * Avisos de la campana: pólizas por vencer, recibos vencidos sin cobrar y (solo ADMIN)
 * diferencias de comisión por aclarar. Solo los que tienen algo pendiente.
 */
export async function getAvisos({ esAdmin }: { esAdmin: boolean }): Promise<Aviso[]> {
  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const limite = new Date(hoy.getTime() + DIAS_POR_VENCER * 86_400_000);
  const [porVencer, vencidos, aclarar] = await Promise.all([
    db.poliza.count({ where: { vigencia_fin: { gte: hoy, lte: limite } } }),
    db.recibo.count({ where: { estado: "PENDIENTE", fecha_vencimiento: { lt: hoy } } }),
    esAdmin ? db.recibo.count({ where: { estado: "PAGADO" } }) : Promise.resolve(0),
  ]);
  const avisos: Aviso[] = [
    {
      clave: "por-vencer",
      titulo: "Pólizas por vencer",
      detalle: `Vencen en los próximos ${DIAS_POR_VENCER} días: prepara su renovación.`,
      cantidad: porVencer,
      href: "/reportes",
      tono: "warning",
    },
    {
      clave: "recibos-vencidos",
      titulo: "Recibos vencidos sin cobrar",
      detalle: "Su fecha de pago ya pasó y siguen pendientes.",
      cantidad: vencidos,
      href: "/polizas",
      tono: "destructive",
    },
    {
      clave: "aclaraciones",
      titulo: "Comisiones por aclarar",
      detalle: "Recibos cobrados con diferencia de comisión.",
      cantidad: aclarar,
      href: "/conciliacion/aclaraciones",
      tono: "info",
    },
  ];
  return avisos.filter((a) => a.cantidad > 0);
}
