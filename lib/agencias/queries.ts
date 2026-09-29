import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";

/** Datos de la agencia (nombre y marca). Memoizado por render: lo usan el layout y las páginas. */
export const getAgencia = cache(async (agenciaId: string) => {
  return db.agencia.findUniqueOrThrow({
    where: { id: agenciaId },
    select: { id: true, nombre: true, logoUrl: true, colorHex: true },
  });
});
