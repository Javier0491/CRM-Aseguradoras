import type { Aseguradora } from "@/lib/generated/prisma/client";

/**
 * Vista pública de una aseguradora para el panel de integraciones.
 * Excluye deliberadamente `api_key` y `api_secret`: las credenciales nunca
 * deben serializarse hacia el cliente.
 */
export type AseguradoraIntegracion = Pick<
  Aseguradora,
  "id" | "nombre" | "color_hex" | "url_portal_cobranza" | "api_endpoint" | "estado_api"
>;

// TODO(Fase 4): reemplazar por `db.aseguradora.findMany({ select: { ... } })`
// seleccionando únicamente los campos de AseguradoraIntegracion.
export const aseguradorasIntegracion: AseguradoraIntegracion[] = [
  { id: "qualitas", nombre: "Quálitas", color_hex: "#6D2077", url_portal_cobranza: "https://agentes.qualitas.com.mx", api_endpoint: null, estado_api: "INACTIVA" },
  { id: "gnp", nombre: "GNP", color_hex: "#F26522", url_portal_cobranza: "https://portal.gnp.com.mx", api_endpoint: null, estado_api: "INACTIVA" },
  { id: "metlife", nombre: "MetLife", color_hex: "#0090DA", url_portal_cobranza: "https://www.metlife.com.mx", api_endpoint: null, estado_api: "INACTIVA" },
  { id: "axa", nombre: "AXA", color_hex: "#00008F", url_portal_cobranza: "https://www.axa.com.mx", api_endpoint: null, estado_api: "INACTIVA" },
  { id: "mapfre", nombre: "Mapfre", color_hex: "#D81E05", url_portal_cobranza: "https://www.mapfre.com.mx", api_endpoint: null, estado_api: "INACTIVA" },
  { id: "chubb", nombre: "Chubb", color_hex: "#8A8D8F", url_portal_cobranza: null, api_endpoint: null, estado_api: "INACTIVA" },
  { id: "hdi", nombre: "HDI", color_hex: "#006B3F", url_portal_cobranza: null, api_endpoint: null, estado_api: "INACTIVA" },
  { id: "allianz", nombre: "Allianz", color_hex: "#003781", url_portal_cobranza: null, api_endpoint: null, estado_api: "INACTIVA" },
];
