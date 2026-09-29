import "server-only";

import { connection } from "next/server";

import { getAgenciaId } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { AseguradoraIntegracion } from "@/lib/integraciones/types";

export async function getAseguradorasIntegracion(): Promise<AseguradoraIntegracion[]> {
  // Consulta en cada solicitud; sin esto la página se prerenderiza en el build
  // y mostraría datos congelados.
  await connection();
  const agenciaId = await getAgenciaId();

  return db.aseguradora.findMany({
    where: { agenciaId },
    // `select` explícito: las credenciales (api_key, api_secret) nunca salen del servidor.
    select: {
      id: true,
      nombre: true,
      color_hex: true,
      url_portal_cobranza: true,
      api_endpoint: true,
      estado_api: true,
    },
    orderBy: { nombre: "asc" },
  });
}
