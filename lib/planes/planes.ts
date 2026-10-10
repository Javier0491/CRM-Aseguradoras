// Planes de ZenSecure: límites operativos y precios. Lo usan el CRM (servidor), el panel del
// SUPERADMIN y la tabla de precios de la landing, así que no importa nada de servidor.
//
// Un plan es un nivel (Agente o Broker) y una edición (Básico o Pro).

import type { CicloFacturacion, EdicionPlan, PlanAgencia } from "@/lib/generated/prisma/client";

export type { CicloFacturacion, EdicionPlan, PlanAgencia };

type Edicion = {
  /** Cuentas activas de la agencia (null = ilimitadas). */
  usuarios: number | null;
  /** Escaneos de carátulas con IA por mes (0 = sin captura con IA; null = sin límite). */
  ocrMensual: number | null;
  /** Precio en MXN por ciclo; el anual equivale a 10 mensualidades. */
  precio: Record<CicloFacturacion, number>;
};

export const PLANES = {
  AGENTE: {
    nombre: "Agente",
    ediciones: {
      BASICO: { usuarios: 1, ocrMensual: 0, precio: { MENSUAL: 900, ANUAL: 9_000 } },
      PRO: { usuarios: 1, ocrMensual: 50, precio: { MENSUAL: 1_500, ANUAL: 15_000 } },
    },
  },
  BROKER: {
    nombre: "Broker",
    ediciones: {
      BASICO: { usuarios: 3, ocrMensual: 250, precio: { MENSUAL: 2_500, ANUAL: 25_000 } },
      PRO: { usuarios: null, ocrMensual: null, precio: { MENSUAL: 4_500, ANUAL: 45_000 } },
    },
  },
} as const satisfies Record<PlanAgencia, { nombre: string; ediciones: Record<EdicionPlan, Edicion> }>;

/** Lo que aplica el CRM a una agencia según su nivel y su edición. */
export type DefinicionPlan = Edicion & {
  /** "Agente Básico", "Broker Pro". */
  nombre: string;
};

export const PLANES_ORDEN = ["AGENTE", "BROKER"] as const satisfies readonly PlanAgencia[];
export const EDICIONES = ["BASICO", "PRO"] as const satisfies readonly EdicionPlan[];
export const CICLOS = ["MENSUAL", "ANUAL"] as const satisfies readonly CicloFacturacion[];

export const ETIQUETA_EDICION: Record<EdicionPlan, string> = { BASICO: "Básico", PRO: "Pro" };
export const ETIQUETA_CICLO: Record<CicloFacturacion, string> = { MENSUAL: "Mensual", ANUAL: "Anual" };

export const esPlan = (v: unknown): v is PlanAgencia => (PLANES_ORDEN as readonly unknown[]).includes(v);
export const esEdicion = (v: unknown): v is EdicionPlan => (EDICIONES as readonly unknown[]).includes(v);
export const esCiclo = (v: unknown): v is CicloFacturacion => (CICLOS as readonly unknown[]).includes(v);

export function definicionPlan(plan: PlanAgencia, edicion: EdicionPlan): DefinicionPlan {
  const nivel = PLANES[plan];
  const { usuarios, ocrMensual, precio }: Edicion = nivel.ediciones[edicion];
  return { nombre: `${nivel.nombre} ${ETIQUETA_EDICION[edicion]}`, usuarios, ocrMensual, precio };
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
