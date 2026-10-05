"use server";

import { revalidatePath } from "next/cache";

import { getAdmin } from "@/lib/auth/dal";
import { diasAvisoValidos, MAX_DIAS_AVISO, MIN_DIAS_AVISO, TIPOS_AVISO, type DiasAviso } from "@/lib/avisos/reglas";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { emailValido } from "@/lib/comunicaciones/envio";
import { db } from "@/lib/db";

export type FilaAvisos = { aseguradoraId: string } & DiasAviso;
export type ConfigAvisosInput = { correoCopia: string; filas: FilaAvisos[] };

/** Guarda el correo de copia de la agencia y la matriz de días por aseguradora (solo ADMIN). */
export async function guardarConfigAvisos(
  raw: ConfigAvisosInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Solo un administrador puede configurar los avisos automáticos." };
  if (typeof raw !== "object" || raw === null || typeof raw.correoCopia !== "string" || !Array.isArray(raw.filas)) {
    return { ok: false, error: "Datos inválidos." };
  }
  const correoCopia = raw.correoCopia.trim().toLowerCase();
  if (correoCopia && (!emailValido(correoCopia) || correoCopia.length > 254)) {
    return { ok: false, error: "Escribe un correo de copia válido." };
  }
  for (const f of raw.filas) {
    if (typeof f?.aseguradoraId !== "string" || !TIPOS_AVISO.every((t) => diasAvisoValidos(f[t.campo]))) {
      return {
        ok: false,
        error: `Los días deben ser un número entero entre ${MIN_DIAS_AVISO} y ${MAX_DIAS_AVISO}, o quedar en blanco.`,
      };
    }
  }

  // Solo aseguradoras de la agencia de la sesión.
  const actuales = await db.aseguradora.findMany({
    where: { agenciaId: admin.agenciaId, id: { in: raw.filas.map((f) => f.aseguradoraId) } },
    select: { id: true, nombre: true, avisoDiasAntes: true, avisoDiasVencido: true, avisoDiasRenovacion: true },
  });
  const porId = new Map(actuales.map((a) => [a.id, a]));
  const cambios = raw.filas.flatMap((f) => {
    const actual = porId.get(f.aseguradoraId);
    if (!actual || TIPOS_AVISO.every((t) => actual[t.campo] === f[t.campo])) return [];
    return [{ actual, fila: f }];
  });
  const agencia = await db.agencia.findUniqueOrThrow({
    where: { id: admin.agenciaId },
    select: { correoCopiaAvisos: true },
  });
  const cambiaCopia = (agencia.correoCopiaAvisos ?? "") !== correoCopia;
  if (cambios.length === 0 && !cambiaCopia) return { ok: true };

  const texto = (d: DiasAviso) => TIPOS_AVISO.map((t) => `${t.titulo}: ${d[t.campo] ?? "no"}`).join(", ");
  await db.$transaction(async (tx) => {
    if (cambiaCopia) {
      await tx.agencia.update({ where: { id: admin.agenciaId }, data: { correoCopiaAvisos: correoCopia || null } });
    }
    for (const { fila } of cambios) {
      await tx.aseguradora.update({
        where: { id: fila.aseguradoraId, agenciaId: admin.agenciaId },
        data: {
          avisoDiasAntes: fila.avisoDiasAntes,
          avisoDiasVencido: fila.avisoDiasVencido,
          avisoDiasRenovacion: fila.avisoDiasRenovacion,
        },
      });
    }
    await registrarBitacora(
      admin,
      {
        accion: "avisos.configurar",
        entidad: "agencia",
        entidadId: admin.agenciaId,
        descripcion: [
          cambiaCopia && `Correo de copia: ${correoCopia || "ninguno"}`,
          ...cambios.map(({ actual, fila }) => `${actual.nombre}: ${texto(actual)} → ${texto(fila)}`),
        ]
          .filter(Boolean)
          .join(" · "),
      },
      tx
    );
  });

  revalidatePath("/configuracion/avisos");
  return { ok: true };
}
