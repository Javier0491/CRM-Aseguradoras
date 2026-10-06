import "server-only";

import { alcanceDe, clientesDe, polizasDe, recibosDe, type Alcance } from "@/lib/auth/alcance";
import { veComisiones, type UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { hoyISO } from "@/lib/format";
import { contarPorRenovar } from "@/lib/renovaciones/queries";
import { getMisPendientesHoy } from "@/lib/tareas/queries";

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
 * póliza vigor o nombre del cliente) y recibos (folio de la aseguradora), dentro de lo que ve la
 * sesión.
 */
export async function buscarGlobal(alcance: Alcance, q: string): Promise<ResultadoBusqueda[]> {
  const texto = q.trim().slice(0, 60);
  if (texto.length < 2) return [];
  const contiene = { contains: texto, mode: "insensitive" as const };

  const [clientes, polizas, recibos] = await Promise.all([
    db.cliente.findMany({
      where: {
        AND: [
          clientesDe(alcance),
          { OR: [{ nombre: contiene }, { rfc: contiene }, { telefono: contiene }, { email: contiene }] },
        ],
      },
      orderBy: { nombre: "asc" },
      take: POR_TIPO,
      select: { id: true, nombre: true, rfc: true, _count: { select: { polizas: true } } },
    }),
    db.poliza.findMany({
      where: {
        ...polizasDe(alcance),
        OR: [{ numeroImpreso: contiene }, { polizaVigor: contiene }, { cliente: { nombre: contiene } }],
      },
      orderBy: { vigencia_fin: "desc" },
      take: POR_TIPO,
      select: {
        id: true,
        numeroImpreso: true,
        canceladaAt: true,
        cliente: { select: { nombre: true } },
        aseguradora: { select: { nombre: true } },
      },
    }),
    db.recibo.findMany({
      where: { AND: [recibosDe(alcance), { folio: contiene }] },
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
      detalle: `${p.cliente.nombre} · ${p.aseguradora.nombre}${p.canceladaAt ? " · cancelada" : ""}`,
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
 * Recibos pendientes cuyo plazo de gracia ya terminó: vencimiento + días de gracia de su
 * aseguradora anterior a hoy. Las aseguradoras se agrupan por sus días de gracia.
 */
export async function contarRecibosEnRiesgo(alcance: Alcance, hoy: Date) {
  const aseguradoras = await db.aseguradora.findMany({
    where: { agenciaId: alcance.agenciaId },
    select: { id: true, diasGracia: true },
  });
  const porGracia = new Map<number, string[]>();
  for (const a of aseguradoras) porGracia.set(a.diasGracia, [...(porGracia.get(a.diasGracia) ?? []), a.id]);
  if (porGracia.size === 0) return 0;
  return db.recibo.count({
    where: {
      AND: [
        recibosDe(alcance),
        { estado: "PENDIENTE" },
        {
          OR: [...porGracia].map(([dias, ids]) => ({
            poliza: { aseguradora_id: { in: ids } },
            fecha_vencimiento: { lt: new Date(hoy.getTime() - dias * 86_400_000) },
          })),
        },
      ],
    },
  });
}

/**
 * Avisos de la campana: mis tareas vencidas o de hoy, renovaciones por atender, recibos vencidos
 * (en gracia o en riesgo) y (solo SUPERADMIN) diferencias de comisión por aclarar. Solo los que
 * tienen algo pendiente.
 */
export async function getAvisos(user: UsuarioSesion): Promise<Aviso[]> {
  const alcance = alcanceDe(user);
  const hoy = new Date(`${hoyISO()}T00:00:00Z`);
  const [tareas, porRenovar, vencidos, riesgo, aclarar] = await Promise.all([
    getMisPendientesHoy(user, 0),
    contarPorRenovar(alcance),
    db.recibo.count({ where: { AND: [recibosDe(alcance), { estado: "PENDIENTE", fecha_vencimiento: { lt: hoy } }] } }),
    contarRecibosEnRiesgo(alcance, hoy),
    veComisiones(user) ? db.recibo.count({ where: { agenciaId: user.agenciaId, estado: "PAGADO" } }) : Promise.resolve(0),
  ]);
  const avisos: Aviso[] = [
    {
      clave: "tareas",
      titulo: "Tareas vencidas o para hoy",
      detalle: "Tus pendientes con fecha de hoy o anterior.",
      cantidad: tareas.total,
      href: "/tareas",
      tono: "warning",
    },
    {
      clave: "por-renovar",
      titulo: "Renovaciones por atender",
      detalle: "Pólizas que vencen en los próximos 30 días sin renovación capturada.",
      cantidad: porRenovar.total,
      href: "/renovaciones",
      tono: "warning",
    },
    {
      clave: "recibos-riesgo",
      titulo: "Recibos en riesgo de cancelación",
      detalle: "Vencidos y fuera de los días de gracia de su aseguradora.",
      cantidad: riesgo,
      href: "/polizas?tab=recibos&recibos=vencidos",
      tono: "destructive",
    },
    {
      clave: "recibos-gracia",
      titulo: "Recibos en periodo de gracia",
      detalle: "Vencidos, pero su aseguradora aún permite pagarlos.",
      cantidad: vencidos - riesgo,
      href: "/polizas?tab=recibos&recibos=vencidos",
      tono: "warning",
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
