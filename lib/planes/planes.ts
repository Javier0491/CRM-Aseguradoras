// Planes de ZenSecure: límites operativos y precios. Lo usan el CRM (servidor), el panel del
// SUPERADMIN y la tabla de precios de la landing, así que no importa nada de servidor.
//
// Un plan es un nivel (Agente, Broker, Promotoría) y, en Agente y Broker, una edición: Básico (sin
// captura con IA) o Pro (con IA). Promotoría no tiene ediciones: todo ilimitado y se cotiza.

import type { CicloFacturacion, EdicionPlan, PlanAgencia } from "@/lib/generated/prisma/client";

export type { CicloFacturacion, EdicionPlan, PlanAgencia };

type Edicion = {
  /** Escaneos de carátulas con IA por mes (0 = sin captura con IA). */
  ocrMensual: number;
  /** Precio en MXN por ciclo; el anual equivale a 10 mensualidades. */
  precio: Record<CicloFacturacion, number>;
};

type Nivel = {
  nombre: string;
  /** Cuentas activas de la agencia (null = ilimitadas). */
  usuarios: number | null;
  /** null: sin ediciones (Promotoría). */
  ediciones: Record<EdicionPlan, Edicion> | null;
};

export const PLANES = {
  AGENTE: {
    nombre: "Agente",
    usuarios: 1,
    ediciones: {
      BASICO: { ocrMensual: 0, precio: { MENSUAL: 900, ANUAL: 9_000 } },
      PRO: { ocrMensual: 50, precio: { MENSUAL: 1_500, ANUAL: 15_000 } },
    },
  },
  BROKER: {
    nombre: "Broker",
    usuarios: 5,
    ediciones: {
      BASICO: { ocrMensual: 0, precio: { MENSUAL: 2_500, ANUAL: 25_000 } },
      PRO: { ocrMensual: 500, precio: { MENSUAL: 4_500, ANUAL: 45_000 } },
    },
  },
  PROMOTORIA: { nombre: "Promotoría", usuarios: null, ediciones: null },
} as const satisfies Record<PlanAgencia, Nivel>;

/** Lo que aplica el CRM a una agencia según su nivel y su edición. */
export type DefinicionPlan = {
  /** "Agente Básico", "Broker Pro", "Promotoría". */
  nombre: string;
  usuarios: number | null;
  /** null = sin límite; 0 = sin captura con IA. */
  ocrMensual: number | null;
  /** null = se cotiza con ventas. */
  precio: Record<CicloFacturacion, number> | null;
};

export const PLANES_ORDEN = ["AGENTE", "BROKER", "PROMOTORIA"] as const satisfies readonly PlanAgencia[];
export const EDICIONES = ["BASICO", "PRO"] as const satisfies readonly EdicionPlan[];
export const CICLOS = ["MENSUAL", "ANUAL"] as const satisfies readonly CicloFacturacion[];

export const ETIQUETA_EDICION: Record<EdicionPlan, string> = { BASICO: "Básico", PRO: "Pro" };
export const ETIQUETA_CICLO: Record<CicloFacturacion, string> = { MENSUAL: "Mensual", ANUAL: "Anual" };

export const esPlan = (v: unknown): v is PlanAgencia => (PLANES_ORDEN as readonly unknown[]).includes(v);
export const esEdicion = (v: unknown): v is EdicionPlan => (EDICIONES as readonly unknown[]).includes(v);
export const esCiclo = (v: unknown): v is CicloFacturacion => (CICLOS as readonly unknown[]).includes(v);

/** ¿El nivel se vende en Básico y Pro? (Promotoría no). */
export const tieneEdiciones = (plan: PlanAgencia) => PLANES[plan].ediciones !== null;

export function definicionPlan(plan: PlanAgencia, edicion: EdicionPlan): DefinicionPlan {
  const nivel: Nivel = PLANES[plan];
  if (!nivel.ediciones) return { nombre: nivel.nombre, usuarios: nivel.usuarios, ocrMensual: null, precio: null };
  const { ocrMensual, precio } = nivel.ediciones[edicion];
  return { nombre: `${nivel.nombre} ${ETIQUETA_EDICION[edicion]}`, usuarios: nivel.usuarios, ocrMensual, precio };
}

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

export function mensajeLimiteUsuarios(plan: PlanAgencia, edicion: EdicionPlan) {
  const { nombre, usuarios } = definicionPlan(plan, edicion);
  return `El plan ${nombre} incluye ${usuarios} ${usuarios === 1 ? "usuario activo" : "usuarios activos"}. Desactiva una cuenta o cambia de plan para agregar otra.`;
}

export function mensajeLimiteOcr(plan: PlanAgencia, edicion: EdicionPlan) {
  const { nombre, ocrMensual } = definicionPlan(plan, edicion);
  if (ocrMensual === 0) {
    return `El plan ${nombre} no incluye captura con IA. Captura la póliza a mano o cámbiate a la edición Pro.`;
  }
  return `Ya usaste los ${ocrMensual} escaneos con IA de este mes del plan ${nombre}. Captura la póliza a mano o cambia de plan; el contador vuelve a cero el día 1.`;
}
