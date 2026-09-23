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
