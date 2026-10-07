"use client";

import * as React from "react";
import { AlertCircle, History, Loader2, Undo2 } from "lucide-react";

import { AseguradoraTag } from "@/components/polizas/poliza-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { revertirLoteConciliacion } from "@/lib/conciliacion/actions";
import type { LoteResumen } from "@/lib/conciliacion/lotes";
import { cn } from "@/lib/utils";

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Lotes de conciliación aplicados, con la opción de revertir el que se aplicó por error. */
export function HistorialLotes({ lotes }: { lotes: LoteResumen[] }) {
  const [aRevertir, setARevertir] = React.useState<LoteResumen | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [mensaje, setMensaje] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function revertir() {
    if (!aRevertir) return;
    startTransition(async () => {
      const res = await revertirLoteConciliacion(aRevertir.id);
      if (res.ok) {
        setMensaje(
          `Se revirtió «${aRevertir.archivo_nombre}»: ${res.restaurados} recibos volvieron a su estado anterior` +
            (res.borrados ? ` y se eliminaron ${res.borrados} auto-creados.` : ".")
        );
        setARevertir(null);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" /> Historial de conciliaciones
        </CardTitle>
        <CardDescription>
          Cada vez que se aplica un estado de cuenta queda un lote. Si se subió el archivo equivocado,
          revertirlo devuelve los recibos a su estado anterior y elimina los que se auto-crearon.
        </CardDescription>
      </CardHeader>
      {mensaje && (
        <p className="border-b bg-success/10 px-5 py-2 text-sm text-success" aria-live="polite">
          {mensaje}
        </p>
      )}
      {lotes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Aún no se ha aplicado ninguna conciliación.</p>
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Aplicado</TableHead>
              <TableHead>Aseguradora</TableHead>
              <TableHead>Archivo</TableHead>
              <TableHead className="text-right">Conciliados</TableHead>
              <TableHead className="text-right">Pagados</TableHead>
              <TableHead className="text-right">Auto-creados</TableHead>
              <TableHead className="w-32 pr-5">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotes.map((l) => {
              const revertido = l.revertido_at !== null;
              return (
                <TableRow key={l.id} className={cn(revertido && "text-muted-foreground")}>
                  <TableCell className="pl-5">
                    <p className="text-sm tabular-nums">{fechaHora.format(new Date(l.created_at))}</p>
                    <p className="text-[11px] text-muted-foreground">{l.usuario_email ?? "—"}</p>
                  </TableCell>
                  <TableCell>
                    <AseguradoraTag nombre={l.aseguradora.nombre} color={l.aseguradora.color_hex} />
                  </TableCell>
                  <TableCell className="max-w-60">
                    <p className="truncate text-sm" title={l.archivo_nombre}>
                      {l.archivo_nombre}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{l.renglones} renglones</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.conciliados}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.pagados}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.creados}</TableCell>
                  <TableCell className="pr-5 text-right">
                    {revertido ? (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                        title={`${fechaHora.format(new Date(l.revertido_at!))} · ${l.revertido_por ?? ""}`}
                      >
                        Revertido
                      </Badge>
                    ) : l.puedeRevertir ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setError(null);
                          setMensaje(null);
                          setARevertir(l);
                        }}
                      >
                        <Undo2 /> Revertir
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={aRevertir !== null} onOpenChange={(v) => !v && !pendiente && setARevertir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Revertir esta conciliación?</DialogTitle>
            <DialogDescription>
              {aRevertir &&
                `«${aRevertir.archivo_nombre}» de ${aRevertir.aseguradora.nombre}: ${aRevertir.conciliados + aRevertir.pagados} ` +
                  `recibos volverán al estado que tenían antes de aplicarlo y se eliminarán ${aRevertir.creados} ` +
                  "recibos auto-creados. Quedará registrado en la bitácora."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pendiente}>
                Cancelar
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={revertir} disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Undo2 />}
              Revertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
