// Herramientas que el asistente puede pedir: su definición para el modelo. La ejecución (con el
// alcance de la sesión) está en lib/asistente/herramientas.ts.
import { RAMOS, ramoLabels } from "@/lib/polizas/ramos";

export const HERRAMIENTAS = [
  {
    type: "function",
    name: "resumen_cartera",
    description:
      "Resumen de la cartera del usuario: pólizas vigentes por ramo, prima vigente, recibos pendientes y vencidos, y renovaciones de los próximos 30 días.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "buscar_polizas",
    description:
      "Busca pólizas por número, póliza vigor o nombre del cliente, con filtros opcionales. Devuelve hasta 15, las más recientes primero.",
    parameters: {
      type: "object",
      properties: {
        texto: { type: ["string", "null"], description: "Número de póliza o nombre del cliente; null para no filtrar." },
        ramo: {
          type: ["string", "null"],
          description: `Uno de: ${RAMOS.map((r) => ramoLabels[r]).join(", ")}; null para todos.`,
        },
        aseguradora: { type: ["string", "null"], description: "Nombre de la aseguradora; null para todas." },
        solo_vigentes: { type: "boolean", description: "true: solo pólizas vigentes y no canceladas." },
        vencen_en_dias: {
          type: ["integer", "null"],
          description: "Solo las que terminan su vigencia entre hoy y los próximos N días (máx. 365); null para no filtrar.",
        },
      },
      required: ["texto", "ramo", "aseguradora", "solo_vigentes", "vencen_en_dias"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "detalle_poliza",
    description: "Detalle de una póliza por su número impreso o póliza vigor: datos del ramo, cliente y recibos.",
    parameters: {
      type: "object",
      properties: { numero: { type: "string", description: "Número de póliza o póliza vigor." } },
      required: ["numero"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "buscar_clientes",
    description: "Busca clientes por nombre, RFC, teléfono o correo. Devuelve hasta 15 con sus datos de contacto y pólizas.",
    parameters: {
      type: "object",
      properties: { texto: { type: "string", description: "Nombre, RFC, teléfono o correo." } },
      required: ["texto"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "recibos_pendientes",
    description:
      "Recibos sin pagar: los vencidos y los que vencen en los próximos N días, ordenados por fecha de vencimiento.",
    parameters: {
      type: "object",
      properties: {
        dias: { type: "integer", description: "Incluye los que vencen de hoy a N días (0 = solo vencidos; máx. 90)." },
      },
      required: ["dias"],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;

/** Lo que el usuario ve mientras corre cada herramienta. */
export const ETIQUETA_HERRAMIENTA: Record<string, string> = {
  resumen_cartera: "Revisando tu cartera",
  buscar_polizas: "Buscando pólizas",
  detalle_poliza: "Abriendo la póliza",
  buscar_clientes: "Buscando clientes",
  recibos_pendientes: "Revisando recibos pendientes",
};
