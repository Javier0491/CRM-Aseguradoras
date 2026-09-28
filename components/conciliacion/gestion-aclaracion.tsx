"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Aclaracion } from "@/lib/conciliacion/aclaraciones";
import { registrarAclaracion } from "@/lib/conciliacion/actions";
import type { TipoNota } from "@/lib/conciliacion/tipos";
import { formatMoneda } from "@/lib/format";
import { cn } from "@/lib/utils";

const OPCIONES: { tipo: TipoNota; label: string; ayuda: string }[] = [
  { tipo: "reclamo", label: "Reclamo a la aseguradora", ayuda: "Registra que se pidió aclarar la diferencia." },
  { tipo: "nota", label: "Nota", ayuda: "Comentario de seguimiento; no cambia el estado." },
  {
    tipo: "pago_adicional",
    label: "Pago adicional",
    ayuda: "La aseguradora pagó una parte faltante. Si con eso cuadra, el recibo queda conciliado.",
  },
  { tipo: "aceptada", label: "Aceptar diferencia", ayuda: "Se da por buena la comisión pagada y el recibo queda conciliado." },
];

const ETIQUETA: Record<string, string> = Object.fromEntries(OPCIONES.map((o) => [o.tipo, o.label]));

const fechaHora = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Diálogo de seguimiento de un recibo pagado con diferencia de comisión. */
export function GestionAclaracion({ aclaracion }: { aclaracion: Aclaracion }) {
  const [abierto, setAbierto] = React.useState(false);
  const [tipo, setTipo] = React.useState<TipoNota>("reclamo");
  const [texto, setTexto] = React.useState("");
  const [monto, setMonto] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    startTransition(async () => {
      const res = await registrarAclaracion(aclaracion.id, {
        tipo,
        texto,
        ...(tipo === "pago_adicional" && { monto: Number(monto.replace(/[$,\s]/g, "")) }),
      });
      if (res.ok) {
        setAbierto(false);
        setTexto("");
        setMonto("");
      } else {
        setError(res.error);
      }
    });
  }

  const faltante = aclaracion.diferencia !== null && aclaracion.diferencia < 0 ? -aclaracion.diferencia : null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setAbierto(true);
        }}
      >
        <MessageSquareText /> Seguimiento
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={guardar} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                Póliza {aclaracion.poliza.numero} · recibo {aclaracion.numero}/{aclaracion.total}
              </DialogTitle>
              <DialogDescription>
                {aclaracion.cliente} · pagada {formatMoneda(aclaracion.pagada)}
                {aclaracion.esperada !== null && ` · esperada ${formatMoneda(aclaracion.esperada)}`}
              </DialogDescription>
            </DialogHeader>

            {aclaracion.notas.length > 0 && (
              <ol className="max-h-40 space-y-2 overflow-y-auto rounded-md border bg-background/60 p-3 text-sm">
                {aclaracion.notas.map((n) => (
                  <li key={n.id}>
                    <p className="text-xs text-muted-foreground">
                      {fechaHora.format(new Date(n.created_at))} · {n.usuario_email ?? "—"} ·{" "}
                      <span className="font-medium text-foreground">{ETIQUETA[n.tipo] ?? n.tipo}</span>
                      {n.monto !== null && ` · +${formatMoneda(n.monto)}`}
                    </p>
                    <p className="whitespace-pre-line">{n.texto}</p>
                  </li>
                ))}
              </ol>
            )}

            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de seguimiento">
              {OPCIONES.map((o) => (
                <button
                  key={o.tipo}
                  type="button"
                  role="radio"
                  aria-checked={tipo === o.tipo}
                  onClick={() => {
                    setTipo(o.tipo);
                    setError(null);
                    if (o.tipo === "pago_adicional" && faltante !== null && !monto) setMonto(faltante.toFixed(2));
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/40",
                    tipo === o.tipo && "border-primary/60 bg-primary/[0.07]"
                  )}
                >
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.ayuda}</span>
                </button>
              ))}
            </div>

            {tipo === "pago_adicional" && (
              <div className="space-y-2">
                <Label htmlFor={`monto-${aclaracion.id}`}>Comisión adicional recibida</Label>
                <Input
                  id={`monto-${aclaracion.id}`}
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="max-w-40 tabular-nums"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`texto-${aclaracion.id}`}>Nota</Label>
              <Textarea
                id={`texto-${aclaracion.id}`}
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setError(null);
                }}
                maxLength={1000}
                rows={3}
                placeholder={
                  tipo === "reclamo"
                    ? "Ej. Se envió correo a la ejecutiva de MetLife con el folio 27872103"
                    : tipo === "aceptada"
                      ? "Motivo por el que se acepta la diferencia"
                      : "Detalle del seguimiento"
                }
              />
            </div>
            {error && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pendiente} onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente}>
                {pendiente ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
