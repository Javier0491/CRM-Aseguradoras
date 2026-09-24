// Etiquetas y piezas de presentación compartidas por el listado y el detalle de pólizas.
import { normalizarHex } from "@/lib/color";
import type { EstadoRecibo, FormaPago, Ramo } from "@/lib/generated/prisma/client";
import { diasDesdeHoy, formatFecha } from "@/lib/format";

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

export function Vencimiento({ fecha, estado, hoy }: { fecha: Date; estado: EstadoRecibo; hoy: string }) {
  const dias = diasDesdeHoy(fecha, hoy);
  let nota: React.ReactNode = null;
  if (estado === "PENDIENTE") {
    if (dias < 0) nota = <span className="text-destructive">Vencido hace {-dias} d</span>;
    else if (dias <= 15) nota = <span className="text-warning">{dias === 0 ? "Vence hoy" : `En ${dias} d`}</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="tabular-nums">{formatFecha(fecha)}</span>
      {nota && <span className="text-xs">{nota}</span>}
    </div>
  );
}
