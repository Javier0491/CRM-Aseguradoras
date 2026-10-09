// Planes de ZenSecure: límites operativos y precios. Lo usan el CRM (servidor), el panel del
// SUPERADMIN y la tabla de precios de la landing, así que no importa nada de servidor.

import type { CicloFacturacion, PlanAgencia } from "@/lib/generated/prisma/client";

export type { CicloFacturacion, PlanAgencia };

export type DefinicionPlan = {
  nombre: string;
  /** Cuentas activas de la agencia (null = ilimitadas). */
  usuarios: number | null;
  /** Escaneos de carátulas con IA por mes (null = sin límite). */
  ocrMensual: number | null;
  /** Precio en MXN por ciclo (null = se cotiza con ventas). */
  precio: Record<CicloFacturacion, number> | null;
};

export const PLANES = {
  AGENTE: { nombre: "Agente", usuarios: 1, ocrMensual: 50, precio: { MENSUAL: 900, ANUAL: 9_000 } },
  BROKER: { nombre: "Broker", usuarios: 5, ocrMensual: 500, precio: { MENSUAL: 3_500, ANUAL: 35_000 } },
  PROMOTORIA: { nombre: "Promotoría", usuarios: null, ocrMensual: null, precio: null },
} as const satisfies Record<PlanAgencia, DefinicionPlan>;

export const PLANES_ORDEN = ["AGENTE", "BROKER", "PROMOTORIA"] as const satisfies readonly PlanAgencia[];
export const CICLOS = ["MENSUAL", "ANUAL"] as const satisfies readonly CicloFacturacion[];

export const ETIQUETA_CICLO: Record<CicloFacturacion, string> = { MENSUAL: "Mensual", ANUAL: "Anual" };

export const esPlan = (v: unknown): v is PlanAgencia => (PLANES_ORDEN as readonly unknown[]).includes(v);
export const esCiclo = (v: unknown): v is CicloFacturacion => (CICLOS as readonly unknown[]).includes(v);

/** ¿Cabe uno más? `usados` son los que ya hay; un límite null no se agota. */
export const hayCupo = (usados: number, limite: number | null) => limite === null || usados < limite;

const numero = new Intl.NumberFormat("es-MX");

/** "3 de 5" o, sin límite, solo "3" (con separador de miles). */
export const textoUso = (usados: number, limite: number | null) =>
  limite === null ? numero.format(usados) : `${numero.format(usados)} de ${numero.format(limite)}`;

/**
 * Mes al que se cargan los escaneos: el primer día del mes de `hoy` (YYYY-MM-DD en hora de la
 * Ciudad de México, ver hoyISO).
 */
export const periodoDe = (hoy: string) => `${hoy.slice(0, 7)}-01`;

export function mensajeLimiteUsuarios(plan: PlanAgencia) {
  const { nombre, usuarios } = PLANES[plan];
  return `El plan ${nombre} incluye ${usuarios} ${usuarios === 1 ? "usuario activo" : "usuarios activos"}. Desactiva una cuenta o cambia de plan para agregar otra.`;
}

export function mensajeLimiteOcr(plan: PlanAgencia) {
  const { nombre, ocrMensual } = PLANES[plan];
  return `Ya usaste los ${ocrMensual} escaneos con IA de este mes del plan ${nombre}. Captura la póliza a mano o cambia de plan; el contador vuelve a cero el día 1.`;
}
