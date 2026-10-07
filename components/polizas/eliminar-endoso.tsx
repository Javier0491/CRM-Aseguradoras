"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { eliminarEndoso } from "@/lib/polizas/estatus-actions";

/** Borra un endoso capturado por error (con confirmación en el mismo botón). */
export function EliminarEndoso({ endosoId }: { endosoId: string }) {
  const [confirmar, setConfirmar] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  if (!confirmar) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-destructive"
        aria-label="Eliminar endoso"
        onClick={() => setConfirmar(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    );
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7" disabled={pendiente} onClick={() => setConfirmar(false)}>
          No
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="h-7"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              const r = await eliminarEndoso(endosoId);
              if (r.ok) toast("Endoso eliminado");
              else setError(r.error);
            })
          }
        >
          {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar
        </Button>
      </span>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
