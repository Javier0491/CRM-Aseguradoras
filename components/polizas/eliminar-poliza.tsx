"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eliminarPoliza } from "@/lib/polizas/actions";

/** Botón y confirmación para borrar la póliza con sus recibos, asegurados y archivos. */
export function EliminarPoliza({
  polizaId,
  numero,
  recibos,
  conciliados,
  asegurados,
  archivos,
}: {
  polizaId: string;
  numero: string;
  recibos: number;
  conciliados: number;
  asegurados: number;
  /** Nombres de los archivos guardados (carátula, negociación, expediente). */
  archivos: string[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [confirmacion, setConfirmacion] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();
  const coincide = confirmacion.trim().toUpperCase() === numero.toUpperCase();

  function eliminar() {
    setError(null);
    startTransition(async () => {
      const res = await eliminarPoliza(polizaId, confirmacion);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.avisoAlmacen) {
        // La póliza ya no existe: se informa y se ofrece volver al listado.
        setAviso(res.avisoAlmacen);
        return;
      }
      router.replace("/polizas");
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setConfirmacion("");
          setError(null);
          setAbierto(true);
        }}
      >
        <Trash2 /> Eliminar póliza
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => !pendiente && !aviso && setAbierto(v)}>
        <DialogContent>
          {aviso ? (
            <>
              <DialogHeader>
                <DialogTitle>Póliza eliminada</DialogTitle>
                <DialogDescription className="flex items-start gap-2 text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {aviso}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => router.replace("/polizas")}>Ir a pólizas</Button>
              </DialogFooter>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (coincide) eliminar();
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>¿Eliminar la póliza {numero}?</DialogTitle>
                <DialogDescription>Esta acción no se puede deshacer. Se borrará:</DialogDescription>
              </DialogHeader>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>
                  La póliza, {recibos === 1 ? "su recibo" : `sus ${recibos} recibos`}
                  {asegurados > 0 && (asegurados === 1 ? " y su asegurado" : ` y sus ${asegurados} asegurados`)}.
                </li>
                <li>
                  {archivos.length > 0
                    ? `Sus archivos en el almacenamiento: ${archivos.join(", ")}.`
                    : "Su carpeta en el almacenamiento (no tiene archivos vinculados)."}
                </li>
                <li className="text-muted-foreground">El cliente se conserva en el directorio.</li>
              </ul>
              {conciliados > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {conciliados === 1 ? "1 recibo ya está conciliado" : `${conciliados} recibos ya están conciliados`}: se
                  perderá su historial de conciliación.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="confirmar-numero" className="text-sm font-normal">
                  Para confirmar, escribe el número de póliza <span className="font-mono font-medium">{numero}</span>
                </Label>
                <Input
                  id="confirmar-numero"
                  value={confirmacion}
                  onChange={(e) => {
                    setConfirmacion(e.target.value);
                    setError(null);
                  }}
                  autoComplete="off"
                  className="font-mono uppercase"
                  disabled={pendiente}
                />
              </div>
              {error && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" /> {error}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={pendiente}>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={!coincide || pendiente}>
                  {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {pendiente ? "Eliminando…" : "Eliminar definitivamente"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
