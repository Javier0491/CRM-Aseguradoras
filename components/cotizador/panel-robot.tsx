"use client";

import * as React from "react";
import { Bot, Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { generarLlaveRobot, revocarLlaveRobot } from "@/lib/cotizador/actions";
import type { EstadoRobot } from "@/lib/cotizador/queries";
import { MINUTOS_ROBOT_ACTIVO } from "@/lib/cotizador/reglas";
import { cn } from "@/lib/utils";

function haceCuanto(min: number) {
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

/** Estado del robot de la oficina y, para el administrador, su llave. */
export function PanelRobot({ estado, esAdmin }: { estado: EstadoRobot; esAdmin: boolean }) {
  const [llave, setLlave] = React.useState<string | null>(null);
  const [copiada, setCopiada] = React.useState(false);
  const [ocupado, startTransition] = React.useTransition();

  const min = estado.minutosDesdeVisto;
  const activo = min !== null && min < MINUTOS_ROBOT_ACTIVO;
  const texto = !estado.configurado
    ? "Sin configurar: un administrador debe generar la llave del robot."
    : min === null
      ? "Llave lista, pero el robot todavía no se ha conectado."
      : activo
        ? `Encendido · revisó la fila ${haceCuanto(min)}`
        : `Parece apagado · última vez ${haceCuanto(min)}. Las cotizaciones esperan hasta que vuelva.`;

  function generar() {
    if (estado.configurado && !window.confirm("La llave actual dejará de servir y habrá que poner la nueva en la computadora del robot. ¿Continuar?")) {
      return;
    }
    startTransition(async () => {
      const r = await generarLlaveRobot();
      if (r.ok) {
        setLlave(r.llave);
        setCopiada(false);
      } else toast.error(r.error);
    });
  }

  function revocar() {
    if (!window.confirm("El robot dejará de poder cotizar hasta que generes una llave nueva. ¿Revocar?")) return;
    startTransition(async () => {
      const r = await revocarLlaveRobot();
      if (r.ok) toast.success("Llave revocada");
      else toast.error(r.error);
    });
  }

  async function copiar() {
    if (!llave) return;
    try {
      await navigator.clipboard.writeText(llave);
      setCopiada(true);
    } catch {
      toast.error("No se pudo copiar: selecciónala y cópiala a mano.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
        <Bot className="size-4" />
        <span
          aria-hidden
          className={cn(
            "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
            activo ? "bg-success" : estado.configurado ? "bg-warning" : "bg-muted-foreground"
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Robot cotizador</p>
        <p className="text-xs text-muted-foreground">{texto}</p>
      </div>
      {esAdmin && (
        <div className="flex gap-2">
          {estado.configurado && (
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={revocar}>
              Revocar llave
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={ocupado} onClick={generar}>
            {ocupado ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {estado.configurado ? "Generar llave nueva" : "Generar llave"}
          </Button>
        </div>
      )}

      <Dialog open={llave !== null} onOpenChange={(v) => !v && setLlave(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Llave del robot cotizador</DialogTitle>
            <DialogDescription>
              Cópiala ahora: no se vuelve a mostrar. Va en la computadora de la oficina, en el archivo
              <code className="mx-1 rounded bg-muted px-1 font-mono text-xs">.zensecure\robot-cotizador.txt</code>
              dentro de la carpeta del usuario. No la mandes por WhatsApp ni la pegues en otro lado.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border bg-muted/50 p-3 font-mono text-xs break-all select-all">{llave}</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cerrar</Button>
            </DialogClose>
            <Button onClick={copiar}>
              {copiada ? <Check /> : <Copy />}
              {copiada ? "Copiada" : "Copiar llave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
