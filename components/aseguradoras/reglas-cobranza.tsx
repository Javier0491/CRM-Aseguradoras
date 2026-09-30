"use client";

import * as React from "react";
import { Loader2, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actualizarReglasCobranza, type ReglasCobranza } from "@/lib/aseguradoras/actions";

/** Diálogo (solo ADMIN) con las reglas de cobranza de una aseguradora. */
export function ReglasCobranzaDialog({
  aseguradora,
}: {
  aseguradora: { id: string; nombre: string } & ReglasCobranza;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [reglas, setReglas] = React.useState<ReglasCobranza>({
    usaPolizaVigor: aseguradora.usaPolizaVigor,
    ignoraRecibosDuplicados: aseguradora.ignoraRecibosDuplicados,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, startGuardar] = React.useTransition();

  function abrir(v: boolean) {
    setAbierto(v);
    if (v) {
      setReglas({ usaPolizaVigor: aseguradora.usaPolizaVigor, ignoraRecibosDuplicados: aseguradora.ignoraRecibosDuplicados });
      setError(null);
    }
  }

  function guardar() {
    startGuardar(async () => {
      const r = await actualizarReglasCobranza(aseguradora.id, reglas);
      if (r.ok) setAbierto(false);
      else setError(r.error);
    });
  }

  const id = `reglas-${aseguradora.id}`;
  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <Settings2 /> Reglas de cobranza
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reglas de cobranza · {aseguradora.nombre}</DialogTitle>
          <DialogDescription>Cambian cómo se capturan sus pólizas y cómo se lee su estado de cuenta.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={`${id}-vigor`}>Usa póliza vigor</Label>
              <p className="text-xs text-muted-foreground">
                Apagado: la captura no pide la póliza vigor y la conciliación cruza por el número de póliza completo,
                tal como lo lee el OCR (p. ej. Quálitas).
              </p>
            </div>
            <Switch
              id={`${id}-vigor`}
              checked={reglas.usaPolizaVigor}
              onCheckedChange={(v) => setReglas((r) => ({ ...r, usaPolizaVigor: v }))}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={`${id}-duplicados`}>Ignorar recibos duplicados</Label>
              <p className="text-xs text-muted-foreground">
                Encendido: si el estado de cuenta repite el mismo recibo de una póliza (p. ej. &quot;1/12&quot;), solo
                cuenta el primer renglón.
              </p>
            </div>
            <Switch
              id={`${id}-duplicados`}
              checked={reglas.ignoraRecibosDuplicados}
              onCheckedChange={(v) => setReglas((r) => ({ ...r, ignoraRecibosDuplicados: v }))}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
