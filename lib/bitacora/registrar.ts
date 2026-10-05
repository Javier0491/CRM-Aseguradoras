import "server-only";

import type { UsuarioSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Acciones que se registran en la bitácora (clave estable → etiqueta en pantalla). */
export const ACCIONES_BITACORA = {
  "conciliacion.aplicar": "Aplicó conciliación",
  "conciliacion.revertir": "Revirtió conciliación",
  "aclaracion.nota": "Nota de aclaración",
  "aclaracion.reclamo": "Reclamo a la aseguradora",
  "aclaracion.pago_adicional": "Pago adicional de comisión",
  "aclaracion.aceptada": "Aceptó diferencia",
  "poliza.crear": "Capturó póliza",
  "poliza.renovar": "Renovó póliza",
  "poliza.editar": "Editó póliza",
  "poliza.eliminar": "Eliminó póliza",
  "poliza.prima_neta": "Cambió prima neta",
  "comision.regla_guardar": "Guardó regla de comisión",
  "comision.regla_eliminar": "Eliminó regla de comisión",
  "usuario.crear": "Creó usuario",
  "usuario.editar": "Editó usuario",
  "usuario.estado": "Activó o desactivó usuario",
  "agencia.editar": "Editó datos de la agencia",
  "agencia.entrar_superadmin": "Superadmin entró a la agencia",
  "agencia.crear": "Creó la agencia",
  "agencia.suspender": "Suspendió la agencia",
  "agencia.reactivar": "Reactivó la agencia",
  "aseguradora.reglas": "Cambió reglas de cobranza",
  "avisos.configurar": "Configuró avisos automáticos",
} as const;
export type AccionBitacora = keyof typeof ACCIONES_BITACORA;

export type EntradaBitacora = {
  accion: AccionBitacora;
  entidad: "poliza" | "recibo" | "lote" | "regla_comision" | "usuario" | "agencia" | "aseguradora";
  entidadId?: string | null;
  descripcion: string;
  datos?: Prisma.InputJsonValue;
};

/**
 * Registra una acción en la bitácora de la agencia del usuario. Pasa el cliente de la transacción (`tx`) cuando la
 * acción es parte de una: así el registro y el cambio se guardan o se descartan juntos.
 */
export async function registrarBitacora(
  usuario: Pick<UsuarioSesion, "id" | "email" | "agenciaId">,
  entrada: EntradaBitacora,
  tx: Prisma.TransactionClient = db
) {
  await tx.bitacora.create({
    data: {
      agenciaId: usuario.agenciaId,
      usuario_id: usuario.id,
      usuario_email: usuario.email,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidad_id: entrada.entidadId ?? null,
      descripcion: entrada.descripcion.slice(0, 500),
      datos: entrada.datos,
    },
  });
}
