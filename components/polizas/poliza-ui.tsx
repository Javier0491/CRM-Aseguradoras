// Etiquetas y piezas de presentación compartidas por el listado y el detalle de pólizas.
import { normalizarHex } from "@/lib/color";
import type { EstadoRecibo, FormaPago, Ramo } from "@/lib/generated/prisma/client";
import { diasDesdeHoy, formatFecha } from "@/lib/format";
import { situacionCobro } from "@/lib/polizas/gracia";

export const ramoLabel: Record<Ramo, string> = {
  AUTOS: "Autos",
  GMM_INDIVIDUAL: "GMM Individual",
  GMM_COLECTIVO: "GMM Colectivo",
  VIDA_INDIVIDUAL: "Vida Individual",
  VIDA_GRUPO: "Vida Grupo",
  DANOS: "Daños",
  RC_PROFESIONAL: "RC Profesional",
  HOGAR: "Hogar",
  OTROS: "Otros",
};

export const formaPagoLabel: Record<FormaPago, string> = {
  ANUAL: "Anual",
  SEMESTRAL: "Semestral",
  TRIMESTRAL: "Trimestral",
  MENSUAL: "Mensual",
};

export const estadoRecibo: Record<EstadoRecibo, { label: string; className: string }> = {
  PENDIENTE: { label: "Pendiente", className: "border-warning/30 bg-warning/10 text-warning" },
  PAGADO: { label: "Pagado", className: "border-success/30 bg-success/10 text-success" },
  CONCILIADO: { label: "Conciliado", className: "border-primary/30 bg-primary/10 text-primary" },
};

export function AseguradoraTag({ nombre, color }: { nombre: string; color: string }) {
  const hex = normalizarHex(color);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={hex ? { backgroundColor: hex } : undefined}
      />
      {nombre}
    </span>
  );
}

/**
 * Fecha de pago de un recibo y, si sigue pendiente, su situación según los días de gracia de la
 * aseguradora: por vencer, en periodo de gracia (con la fecha límite) o en riesgo de cancelación.
 */
export function Vencimiento({
  fecha,
  estado,
  hoy,
  diasGracia,
}: {
  fecha: Date;
  estado: EstadoRecibo;
  hoy: string;
  diasGracia: number;
}) {
  const dias = diasDesdeHoy(fecha, hoy);
  let nota: React.ReactNode = null;
  if (estado === "PENDIENTE") {
    const { situacion, fechaLimite, diasRestantes } = situacionCobro(fecha.toISOString().slice(0, 10), diasGracia, hoy);
    if (situacion === "riesgo") {
      nota = <span className="font-medium text-destructive">Riesgo de cancelación · venció hace {-dias} d</span>;
    } else if (situacion === "gracia") {
      nota = (
        <span className="font-medium text-warning">
          En gracia · paga antes del {formatFecha(`${fechaLimite}T00:00:00Z`)} (
          {diasRestantes === 0 ? "último día" : `quedan ${diasRestantes} d`})
        </span>
      );
    } else if (dias <= 15) {
      nota = <span className="text-warning">{dias === 0 ? "Vence hoy" : `En ${dias} d`}</span>;
    }
  }
  return (
    <div className="flex flex-col">
      <span className="tabular-nums">{formatFecha(fecha)}</span>
      {nota && <span className="text-xs">{nota}</span>}
    </div>
  );
}

// Colores sutiles por ramo: fondo y borde translúcidos; texto oscuro en modo claro y claro en oscuro.
const ramoEstilo: Record<Ramo, string> = {
  AUTOS: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  GMM_INDIVIDUAL: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  GMM_COLECTIVO: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  VIDA_INDIVIDUAL: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  VIDA_GRUPO: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300",
  DANOS: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  RC_PROFESIONAL: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  HOGAR: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  OTROS: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

export function RamoBadge({ ramo }: { ramo: Ramo }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${ramoEstilo[ramo]}`}
    >
      {ramoLabel[ramo]}
    </span>
  );
}

export type EstadoVigencia = "vigente" | "por_vencer" | "vencida";

/** Estado según el fin de vigencia: vencida, por vencer (dentro de `diasAviso`) o vigente. */
export function estadoVigencia(fin: Date, hoy: string, diasAviso: number): EstadoVigencia {
  const dias = diasDesdeHoy(fin, hoy);
  if (dias < 0) return "vencida";
  return dias <= diasAviso ? "por_vencer" : "vigente";
}

export const vigenciaEstilo: Record<EstadoVigencia, { label: string; punto: string; texto: string }> = {
  vigente: { label: "Vigente", punto: "bg-success", texto: "text-success" },
  por_vencer: { label: "Por vencer", punto: "bg-warning", texto: "text-warning" },
  vencida: { label: "Vencida", punto: "bg-destructive", texto: "text-destructive" },
};

/** Estatus de vigencia como píldora (Vigente, Por vencer, Vencida). */
export function EstadoVigenciaBadge({ fin, hoy, diasAviso }: { fin: Date; hoy: string; diasAviso: number }) {
  const estado = estadoVigencia(fin, hoy, diasAviso);
  const e = vigenciaEstilo[estado];
  const fondo = { vigente: "border-success/30 bg-success/10", por_vencer: "border-warning/30 bg-warning/10", vencida: "border-destructive/30 bg-destructive/10" }[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${fondo} ${e.texto}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${e.punto}`} />
      {e.label}
    </span>
  );
}

export function EstadoVigenciaIndicador({
  fin,
  hoy,
  diasAviso,
}: {
  fin: Date;
  hoy: string;
  diasAviso: number;
}) {
  const estado = estadoVigencia(fin, hoy, diasAviso);
  const dias = diasDesdeHoy(fin, hoy);
  const e = vigenciaEstilo[estado];
  const detalle =
    estado === "vencida"
      ? `hace ${-dias} d`
      : estado === "por_vencer"
        ? dias === 0
          ? "vence hoy"
          : `en ${dias} d`
        : null;
  return (
    <span className="inline-flex flex-col">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${e.texto}`}>
        <span aria-hidden className={`size-2 rounded-full ${e.punto}`} />
        {e.label}
      </span>
      {detalle && <span className="pl-3.5 text-[11px] text-muted-foreground">{detalle}</span>}
    </span>
  );
}

/**
 * Resumen de asegurados: en ramos con censo (GMM Colectivo) la empresa contratante;
 * en el resto, "Titular + N dependientes".
 */
export function AseguradosResumen({
  ramo,
  contratante,
  titular,
  total,
}: {
  ramo: Ramo;
  contratante: string;
  titular: string | null;
  total: number;
}) {
  if (ramo === "GMM_COLECTIVO") {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{contratante}</span>
        <span className="text-[11px] text-muted-foreground">Colectivo · censo</span>
      </span>
    );
  }
  if (total === 0) return <span className="text-xs text-muted-foreground">Sin asegurados</span>;

  const dependientes = titular ? total - 1 : total;
  const resumen = titular
    ? dependientes === 0
      ? "Solo titular"
      : `Titular + ${dependientes} ${dependientes === 1 ? "dependiente" : "dependientes"}`
    : `${total} ${total === 1 ? "asegurado" : "asegurados"}`;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-sm">{resumen}</span>
      {titular && <span className="truncate text-[11px] text-muted-foreground">{titular}</span>}
    </span>
  );
}

/** Aviso de un cliente capturado sin teléfono o sin correo. No muestra nada si tiene ambos. */
export function FaltaContacto({ telefono, email }: { telefono: string; email: string }) {
  const sinTelefono = !telefono.trim();
  const sinCorreo = !email.trim();
  if (!sinTelefono && !sinCorreo) return null;
  const label = sinTelefono && sinCorreo ? "Falta contacto" : sinTelefono ? "Falta teléfono" : "Falta correo";
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
      <span className="size-1.5 rounded-full bg-warning" aria-hidden />
      {label}
    </span>
  );
}
