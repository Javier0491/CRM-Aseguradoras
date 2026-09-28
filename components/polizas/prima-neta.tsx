"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoneda } from "@/lib/format";
import { actualizarPrimaNeta } from "@/lib/polizas/actions";

/**
 * Prima neta de la póliza con edición en línea. Sin ella no se puede calcular la comisión
 * esperada, así que las pólizas anteriores al campo la muestran como pendiente.
 */
export function PrimaNeta({ polizaId, valor }: { polizaId: string; valor: number | null }) {
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(valor === null ? "" : valor.toFixed(2));
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    startTransition(async () => {
      const res = await actualizarPrimaNeta(polizaId, texto);
      if (res.ok) {
        setEditando(false);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  }

  if (!editando) {
    return (
      <span className="flex items-center gap-1.5">
        {valor === null ? (
          <span className="flex items-center gap-1 text-warning" title="Sin prima neta no se calcula la comisión esperada">
            <AlertTriangle className="size-3.5" /> Sin capturar
          </span>
        ) : (
          formatMoneda(valor)
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          aria-label="Editar prima neta"
          onClick={() => {
            setTexto(valor === null ? "" : valor.toFixed(2));
            setError(null);
            setEditando(true);
          }}
        >
          <Pencil className="size-3" />
        </Button>
      </span>
    );
  }

  return (
    <form onSubmit={guardar} className="space-y-1">
      <div className="flex items-center gap-1">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input
            autoFocus
            inputMode="decimal"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError(null);
            }}
            aria-label="Prima neta"
            aria-invalid={Boolean(error)}
            className="h-7 w-36 pl-5 text-sm tabular-nums"
            disabled={pendiente}
          />
        </div>
        <Button type="submit" size="icon" className="size-7" aria-label="Guardar prima neta" disabled={pendiente}>
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Cancelar"
          disabled={pendiente}
          onClick={() => setEditando(false)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <p className={error ? "text-xs font-normal text-destructive" : "text-xs font-normal text-muted-foreground"}>
        {error ?? "Sin IVA, recargos ni derecho de póliza."}
      </p>
    </form>
  );
}
