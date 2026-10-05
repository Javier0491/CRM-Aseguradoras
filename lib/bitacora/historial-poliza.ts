import "server-only";

import { getAgenciaId } from "@/lib/auth/dal";
import { superadminsOcultos } from "@/lib/bitacora/queries";
import { ACCIONES_BITACORA, type AccionBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import { formatFecha, formatMoneda } from "@/lib/format";

export const LIMITE_HISTORIAL = 100;

export type TipoEventoHistorial = "captura" | "edicion" | "conciliacion" | "reversion" | "aclaracion" | "eliminacion";

export type EventoHistorial = {
  id: string;
  fecha: Date;
  usuario: string | null;
  tipo: TipoEventoHistorial;
  titulo: string;
  descripcion: string;
  /** Campos que cambió una edición, con su valor anterior y el nuevo. */
  cambios?: { campo: string; antes: string; despues: string }[];
};

/** Campos de una edición que se muestran con su valor anterior y nuevo (los demás solo se nombran). */
const CAMPOS_DETALLE: Record<string, { etiqueta: string; formato?: (v: string) => string }> = {
  numeroImpreso: { etiqueta: "Número" },
  polizaVigor: { etiqueta: "Póliza vigor" },
  ramo: { etiqueta: "Ramo" },
  vigencia_inicio: { etiqueta: "Inicio de vigencia", formato: (v) => formatFecha(`${v}T00:00:00Z`) },
  vigencia_fin: { etiqueta: "Fin de vigencia", formato: (v) => formatFecha(`${v}T00:00:00Z`) },
  prima_total: { etiqueta: "Prima total", formato: (v) => formatMoneda(Number(v)) },
  prima_neta: { etiqueta: "Prima neta", formato: (v) => formatMoneda(Number(v)) },
  forma_pago: { etiqueta: "Forma de pago" },
};
const CAMPOS_COMISION: typeof CAMPOS_DETALLE = {
  comision_personalizada_pct: { etiqueta: "Comisión personalizada", formato: (v) => `${v}%` },
};

const TIPO_CAMBIO_LOTE: Record<string, string> = {
  conciliado: "conciliado",
  pagado: "pagado con diferencia de comisión",
  creado: "auto-creado como cobrado",
};

function tipoDeAccion(accion: string): TipoEventoHistorial {
  if (accion === "poliza.crear" || accion === "poliza.renovar") return "captura";
  if (accion === "poliza.eliminar") return "eliminacion";
  if (accion.startsWith("aclaracion.")) return "aclaracion";
  return "edicion";
}

const esLeidaConIa = (datos: unknown) =>
  typeof datos === "object" && datos !== null && (datos as { origen?: unknown }).origen === "ocr";

function cambiosDeEdicion(datos: unknown, verComisiones: boolean): EventoHistorial["cambios"] {
  if (typeof datos !== "object" || datos === null) return undefined;
  const { antes, despues } = datos as { antes?: Record<string, string>; despues?: Record<string, string> };
  if (!antes || !despues) return undefined;
  const campos = verComisiones ? { ...CAMPOS_DETALLE, ...CAMPOS_COMISION } : CAMPOS_DETALLE;
  const fmt = (c: (typeof campos)[string], v: string | undefined) => (!v ? "—" : c.formato ? c.formato(v) : v);
  return Object.entries(campos)
    .filter(([k]) => k in despues)
    .map(([k, c]) => ({ campo: c.etiqueta, antes: fmt(c, antes[k]), despues: fmt(c, despues[k]) }));
}

/**
 * Línea de tiempo de una póliza, de lo más reciente a lo más antiguo: su captura o renovación, ediciones,
 * cambios de prima neta, las conciliaciones (y reversiones) que tocaron sus recibos y las aclaraciones de
 * comisión. Las conciliaciones salen de los lotes, que guardan qué le hicieron a cada recibo. Los montos de
 * comisión solo se incluyen si `verComisiones`. Lo que hizo un SUPERADMIN solo lo ve otro SUPERADMIN.
 */
export async function getHistorialPoliza(
  poliza: { id: string; numeroImpreso: string; recibos: { id: string; numero: number }[] },
  verComisiones: boolean
): Promise<EventoHistorial[]> {
  const [agenciaId, ocultos] = await Promise.all([getAgenciaId(), superadminsOcultos()]);
  const deSuperadmin = (email: string | null) => Boolean(email && ocultos?.emails.includes(email.toLowerCase()));
  const reciboIds = poliza.recibos.map((r) => r.id);
  const numeroRecibo = new Map(poliza.recibos.map((r) => [r.id, r.numero]));

  const [registros, cambiosLote] = await Promise.all([
    db.bitacora.findMany({
      where: {
        agenciaId,
        // Con OR para conservar los movimientos sin usuario: NOT IN descarta los NULL.
        ...(ocultos?.ids.length && {
          AND: [{ OR: [{ usuario_id: null }, { usuario_id: { notIn: ocultos.ids } }] }],
        }),
        OR: [
          { entidad: "poliza", entidad_id: poliza.id },
          // La renovación se registra en la póliza nueva; también es parte de la historia de la anterior.
          { accion: "poliza.renovar", datos: { path: ["renuevaA"], equals: poliza.id } },
          ...(reciboIds.length ? [{ entidad: "recibo", entidad_id: { in: reciboIds } }] : []),
        ],
      },
      orderBy: { created_at: "desc" },
      take: LIMITE_HISTORIAL,
      select: {
        id: true,
        created_at: true,
        usuario_email: true,
        accion: true,
        entidad_id: true,
        entidad: true,
        descripcion: true,
        datos: true,
      },
    }),
    db.loteCambio.findMany({
      where: {
        agenciaId,
        OR: [
          ...(reciboIds.length ? [{ recibo_id: { in: reciboIds } }] : []),
          // Recibos que ya no existen (auto-creados que se revirtieron): quedan ligados por el número.
          { recibo_id: null, poliza_numero: poliza.numeroImpreso },
        ],
      },
      select: {
        tipo: true,
        recibo_numero: true,
        lote: {
          select: {
            id: true,
            created_at: true,
            usuario_id: true,
            usuario_email: true,
            archivo_nombre: true,
            revertido_at: true,
            revertido_por: true,
            aseguradora: { select: { nombre: true } },
          },
        },
      },
    }),
  ]);

  const eventos: EventoHistorial[] = registros.map((r) => {
    const accion = r.accion as AccionBitacora;
    const titulo = ACCIONES_BITACORA[accion] ?? r.accion;
    const tipo = tipoDeAccion(r.accion);
    // Las aclaraciones llevan montos de comisión: sin permiso solo se dice qué recibo se aclaró.
    const descripcion =
      tipo === "aclaracion" && !verComisiones
        ? `Seguimiento de comisión del recibo ${numeroRecibo.get(r.entidad_id ?? "") ?? ""}`.trim()
        : r.descripcion;
    return {
      id: r.id,
      fecha: r.created_at,
      usuario: r.usuario_email,
      tipo,
      titulo:
        r.entidad_id !== poliza.id && r.entidad === "poliza"
          ? "Se renovó"
          : esLeidaConIa(r.datos)
            ? `${titulo} con Captura Inteligente`
            : titulo,
      descripcion,
      cambios: accion === "poliza.editar" ? cambiosDeEdicion(r.datos, verComisiones) : undefined,
    };
  });

  // Un evento por lote de conciliación, con los recibos de esta póliza que tocó.
  const lotes = new Map<string, { lote: (typeof cambiosLote)[number]["lote"]; recibos: string[] }>();
  for (const c of cambiosLote) {
    const g = lotes.get(c.lote.id) ?? { lote: c.lote, recibos: [] };
    g.recibos.push(`recibo ${c.recibo_numero} ${TIPO_CAMBIO_LOTE[c.tipo] ?? c.tipo}`);
    lotes.set(c.lote.id, g);
  }
  for (const { lote, recibos } of lotes.values()) {
    const origen = `«${lote.archivo_nombre}» de ${lote.aseguradora.nombre}`;
    if (!(lote.usuario_id && ocultos?.ids.includes(lote.usuario_id))) {
      eventos.push({
        id: `lote-${lote.id}`,
        fecha: lote.created_at,
        usuario: lote.usuario_email,
        tipo: "conciliacion",
        titulo: "Conciliación con estado de cuenta",
        descripcion: `${origen}: ${recibos.join(", ")}`,
      });
    }
    if (lote.revertido_at && !deSuperadmin(lote.revertido_por)) {
      eventos.push({
        id: `lote-${lote.id}-revertido`,
        fecha: lote.revertido_at,
        usuario: lote.revertido_por,
        tipo: "reversion",
        titulo: "Revirtió conciliación",
        descripcion: `${origen}: los recibos volvieron a su estado anterior`,
      });
    }
  }

  return eventos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, LIMITE_HISTORIAL);
}
