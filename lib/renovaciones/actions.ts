"use server";

import { revalidatePath } from "next/cache";

import { alcanceDe, polizasDe } from "@/lib/auth/alcance";
import { getCurrentUser } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import {
  COLUMNAS_EMBUDO,
  ETAPA_DB,
  esEtapaManual,
  MOTIVOS_PERDIDA,
  notaDePerdida,
  type EtapaManual,
} from "@/lib/renovaciones/reglas";

export type CambioEtapaResultado = { ok: true } | { ok: false; error: string };

/**
 * Mueve una póliza en el embudo de renovaciones. "perdida" exige un motivo (MOTIVOS_PERDIDA) y
 * acepta un detalle; en las demás etapas la nota es opcional. Una póliza cancelada no se gestiona.
 */
export async function cambiarEtapaRenovacion(
  polizaId: string,
  etapa: EtapaManual,
  datos: { motivo?: string; nota?: string } = {}
): Promise<CambioEtapaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId) || !esEtapaManual(etapa)) {
    return { ok: false, error: "Datos inválidos." };
  }
  const motivo = typeof datos.motivo === "string" ? datos.motivo : "";
  const detalle = typeof datos.nota === "string" ? datos.nota : "";
  if (etapa === "perdida" && !(MOTIVOS_PERDIDA as readonly string[]).includes(motivo)) {
    return { ok: false, error: "Elige el motivo por el que no se renovó." };
  }

  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, ...polizasDe(alcanceDe(user)) },
    select: { numeroImpreso: true, canceladaAt: true, renovacionEtapa: true, cliente: { select: { nombre: true } } },
  });
  if (!poliza) return { ok: false, error: "La póliza ya no existe." };
  if (poliza.canceladaAt) return { ok: false, error: "La póliza está cancelada: no se renueva." };

  const nota =
    etapa === "perdida" ? notaDePerdida(motivo, detalle) : detalle.trim().replace(/\s+/g, " ").slice(0, 300) || null;
  const titulo = COLUMNAS_EMBUDO.find((c) => c.clave === etapa)?.titulo ?? etapa;

  await db.$transaction(async (tx) => {
    await tx.poliza.update({
      where: { id: polizaId, agenciaId: user.agenciaId },
      data: { renovacionEtapa: ETAPA_DB[etapa], renovacionNota: nota, renovacionEtapaAt: new Date() },
    });
    await registrarBitacora(
      user,
      {
        accion: "renovacion.etapa",
        entidad: "poliza",
        entidadId: polizaId,
        descripcion: `Renovación de la póliza ${poliza.numeroImpreso} (${poliza.cliente.nombre}): ${titulo}${nota ? ` · ${nota}` : ""}`,
      },
      tx
    );
  });

  revalidatePath("/renovaciones");
  revalidatePath(`/polizas/${polizaId}`);
  revalidatePath("/");
  return { ok: true };
}
