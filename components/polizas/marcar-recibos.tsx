"use client";

import * as React from "react";
import { CheckCheck, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { marcarRecibosPagados } from "@/lib/polizas/recibos-actions";
import { cn } from "@/lib/utils";

/**
 * Marca recibos como pagados a mano (cobrados fuera de la conciliación) o los regresa a pendiente.
 * Con varios recibos pide confirmar en el mismo botón.
 */
export function MarcarRecibos({
  ids,
  pagado,
  etiqueta,
  className,
}: {
  ids: string[];
  /** true: marcar como pagados; false: regresar a pendiente. */
  pagado: boolean;
  etiqueta: string;
  className?: string;
}) {
  const [confirmar, setConfirmar] = React.useState(false);
  const [pendiente, startTransition] = React.useTransition();
  const varios = ids.length > 1;

  const aplicar = () =>
    startTransition(async () => {
      const r = await marcarRecibosPagados(ids, pagado);
      setConfirmar(false);
      if (!r.ok) toast.error(r.error);
      else if (pagado) toast(r.cambiados === 1 ? "Recibo marcado como pagado" : `${r.cambiados} recibos marcados como pagados`);
      else toast(r.cambiados === 1 ? "Recibo regresado a pendiente" : `${r.cambiados} recibos regresados a pendiente`);
    });

  if (varios && confirmar) {
    return (
      <span className={cn("flex items-center gap-1", className)}>
        <Button variant="ghost" size="sm" className="h-7" disabled={pendiente} onClick={() => setConfirmar(false)}>
          No
        </Button>
        <Button size="sm" className="h-7" disabled={pendiente} onClick={aplicar}>
          {pendiente ? <Loader2 className="animate-spin" /> : <CheckCheck />} Sí, marcar {ids.length}
        </Button>
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("h-7 px-2 text-xs text-muted-foreground hover:text-foreground", className)}
      disabled={pendiente}
      onClick={() => (varios ? setConfirmar(true) : aplicar())}
    >
      {pendiente ? <Loader2 className="animate-spin" /> : pagado ? <CheckCheck /> : <Undo2 />}
      {etiqueta}
    </Button>
  );
}
