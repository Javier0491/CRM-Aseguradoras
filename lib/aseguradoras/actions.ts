"use server";

import { revalidatePath } from "next/cache";

import { getAdmin } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";

export type ReglasCobranza = { usaPolizaVigor: boolean; ignoraRecibosDuplicados: boolean };

const etiqueta = (r: ReglasCobranza) =>
  `${r.usaPolizaVigor ? "usa" : "sin"} póliza vigor, ${r.ignoraRecibosDuplicados ? "ignora" : "cuenta"} recibos duplicados`;

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

  const actual = await db.aseguradora.findUnique({
    where: { id: aseguradoraId, agenciaId: admin.agenciaId },
    select: { nombre: true, usaPolizaVigor: true, ignoraRecibosDuplicados: true },
  });
  if (!actual) return { ok: false, error: "La aseguradora ya no existe." };
  const nuevas = { usaPolizaVigor: reglas.usaPolizaVigor, ignoraRecibosDuplicados: reglas.ignoraRecibosDuplicados };
  if (actual.usaPolizaVigor === nuevas.usaPolizaVigor && actual.ignoraRecibosDuplicados === nuevas.ignoraRecibosDuplicados) {
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
  // Cambian la captura (se pide o no la póliza vigor) y la conciliación.
  revalidatePath("/aseguradoras");
  revalidatePath("/captura");
  revalidatePath("/conciliacion");
  return { ok: true };
}
