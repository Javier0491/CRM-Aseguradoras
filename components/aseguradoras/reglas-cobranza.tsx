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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actualizarReglasCobranza, type ReglasCobranza } from "@/lib/aseguradoras/actions";
import { MAX_DIAS_GRACIA } from "@/lib/polizas/gracia";

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
    diasGracia: aseguradora.diasGracia,
  });
  // Texto del campo: se permite vaciarlo mientras se escribe.
  const [diasTexto, setDiasTexto] = React.useState(String(aseguradora.diasGracia));
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, startGuardar] = React.useTransition();

  function abrir(v: boolean) {
    setAbierto(v);
    if (v) {
      setReglas({
        usaPolizaVigor: aseguradora.usaPolizaVigor,
        ignoraRecibosDuplicados: aseguradora.ignoraRecibosDuplicados,
        diasGracia: aseguradora.diasGracia,
      });
      setDiasTexto(String(aseguradora.diasGracia));
      setError(null);
    }
  }

  function guardar() {
    const diasGracia = diasTexto.trim() === "" ? 0 : Number(diasTexto);
    if (!Number.isInteger(diasGracia) || diasGracia < 0 || diasGracia > MAX_DIAS_GRACIA) {
      setError(`Los días de gracia deben ser un número entero entre 0 y ${MAX_DIAS_GRACIA}.`);
      return;
    }
    startGuardar(async () => {
      const r = await actualizarReglasCobranza(aseguradora.id, { ...reglas, diasGracia });
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
          <DialogDescription>
            Cambian cómo se capturan sus pólizas, cómo se lee su estado de cuenta y cuándo un recibo sin pagar está en
            riesgo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={`${id}-gracia`}>Días de gracia para pagar</Label>
              <p className="text-xs text-muted-foreground">
                Días después del vencimiento de un recibo en que el cliente aún puede pagar sin que se cancele la
                póliza (p. ej. MetLife 30). Con 0, un recibo vencido pasa directo a riesgo de cancelación (p. ej.
                Quálitas).
              </p>
            </div>
            <Input
              id={`${id}-gracia`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_DIAS_GRACIA}
              step={1}
              value={diasTexto}
              onChange={(e) => setDiasTexto(e.target.value)}
              className="w-20 shrink-0 text-right tabular-nums"
            />
          </div>
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
