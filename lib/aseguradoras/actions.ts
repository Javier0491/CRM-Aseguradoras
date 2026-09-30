"use server";

import { revalidatePath } from "next/cache";

import { getAdmin } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import { MAX_DIAS_GRACIA } from "@/lib/polizas/gracia";

export type ReglasCobranza = { usaPolizaVigor: boolean; ignoraRecibosDuplicados: boolean; diasGracia: number };

const etiqueta = (r: ReglasCobranza) =>
  `${r.usaPolizaVigor ? "usa" : "sin"} póliza vigor, ${r.ignoraRecibosDuplicados ? "ignora" : "cuenta"} recibos duplicados, ` +
  `${r.diasGracia} ${r.diasGracia === 1 ? "día" : "días"} de gracia`;

/** Cambia las reglas de cobranza de una aseguradora de la agencia (solo ADMIN). */
export async function actualizarReglasCobranza(
  aseguradoraId: string,
  reglas: ReglasCobranza
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede cambiar las reglas de cobranza." };
  if (
    typeof aseguradoraId !== "string" ||
    typeof reglas?.usaPolizaVigor !== "boolean" ||
    typeof reglas?.ignoraRecibosDuplicados !== "boolean"
  ) {
    return { ok: false, error: "Datos inválidos." };
  }
  if (!Number.isInteger(reglas.diasGracia) || reglas.diasGracia < 0 || reglas.diasGracia > MAX_DIAS_GRACIA) {
    return { ok: false, error: `Los días de gracia deben ser un número entero entre 0 y ${MAX_DIAS_GRACIA}.` };
  }

  const actual = await db.aseguradora.findUnique({
    where: { id: aseguradoraId, agenciaId: admin.agenciaId },
    select: { nombre: true, usaPolizaVigor: true, ignoraRecibosDuplicados: true, diasGracia: true },
  });
  if (!actual) return { ok: false, error: "La aseguradora ya no existe." };
  const nuevas = {
    usaPolizaVigor: reglas.usaPolizaVigor,
    ignoraRecibosDuplicados: reglas.ignoraRecibosDuplicados,
    diasGracia: reglas.diasGracia,
  };
  if (
    actual.usaPolizaVigor === nuevas.usaPolizaVigor &&
    actual.ignoraRecibosDuplicados === nuevas.ignoraRecibosDuplicados &&
    actual.diasGracia === nuevas.diasGracia
  ) {
    return { ok: true };
  }

  await db.$transaction(async (tx) => {
    await tx.aseguradora.update({ where: { id: aseguradoraId, agenciaId: admin.agenciaId }, data: nuevas });
    await registrarBitacora(
      admin,
      {
        accion: "aseguradora.reglas",
        entidad: "aseguradora",
        entidadId: aseguradoraId,
        descripcion: `${actual.nombre}: ${etiqueta(actual)} → ${etiqueta(nuevas)}`,
      },
      tx
    );
  });
  // Cambian la captura (se pide o no la póliza vigor), la conciliación y el estado de los recibos.
  revalidatePath("/aseguradoras");
  revalidatePath("/polizas", "layout");
  revalidatePath("/captura");
  revalidatePath("/conciliacion");
  return { ok: true };
}
