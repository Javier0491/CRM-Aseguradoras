"use client";

import * as React from "react";
import { ArrowRightLeft, Check, Loader2, XCircle } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cambiarEtapaRenovacion } from "@/lib/renovaciones/actions";
import { COLUMNAS_EMBUDO, MOTIVOS_PERDIDA, type ColumnaEmbudo, type EtapaManual } from "@/lib/renovaciones/reglas";
import { conDeshacer } from "@/lib/toast";
import { cn } from "@/lib/utils";

const tituloDe = (c: ColumnaEmbudo) => COLUMNAS_EMBUDO.find((x) => x.clave === c)?.titulo ?? c;

/**
 * "Deshacer" de un cambio de etapa: regresa a la anterior. No aplica si venía de "Perdida" (habría
 * que volver a pedir el motivo) ni de "Renovada" (no se elige a mano).
 */
function deshacerHacia(polizaId: string, anterior: ColumnaEmbudo) {
  if (anterior === "perdida" || anterior === "renovada") return {};
  return conDeshacer(() => cambiarEtapaRenovacion(polizaId, anterior), `Regresó a «${tituloDe(anterior)}».`);
}

/**
 * Menú para mover una póliza entre las etapas del embudo. "Perdida" pide el motivo en un diálogo;
 * "Renovada" no se elige: sale de capturar la renovación.
 */
export function MoverEtapa({
  polizaId,
  numero,
  actual,
  compacto = false,
}: {
  polizaId: string;
  numero: string;
  actual: ColumnaEmbudo;
  compacto?: boolean;
}) {
  const [pendiente, startTransition] = React.useTransition();
  const [perdida, setPerdida] = React.useState(false);

  function mover(etapa: EtapaManual) {
    startTransition(async () => {
      const r = await cambiarEtapaRenovacion(polizaId, etapa);
      if (!r.ok) {
        toast.error(r.error, { description: `Póliza ${numero}` });
        return;
      }
      toast.success(`Movida a «${tituloDe(etapa)}»`, {
        description: `Póliza ${numero}`,
        ...deshacerHacia(polizaId, actual),
      });
    });
  }

  const etapas = COLUMNAS_EMBUDO.filter((c) => c.clave !== "renovada");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(compacto && "h-7 px-2 text-xs")}
            disabled={pendiente}
            aria-label={`Mover la renovación de la póliza ${numero}`}
          >
            {pendiente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            {compacto ? "Mover" : "Etapa de renovación"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Mover a…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {etapas.map((c) => (
            <DropdownMenuItem
              key={c.clave}
              disabled={c.clave === actual}
              variant={c.clave === "perdida" ? "destructive" : "default"}
              onSelect={() => (c.clave === "perdida" ? setPerdida(true) : mover(c.clave as EtapaManual))}
            >
              {c.clave === actual ? <Check /> : c.clave === "perdida" ? <XCircle /> : <span className="size-4" />}
              {c.titulo}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <MarcarPerdida
        polizaId={polizaId}
        numero={numero}
        actual={actual}
        abierto={perdida}
        onCerrar={() => setPerdida(false)}
      />
    </>
  );
}

function MarcarPerdida({
  polizaId,
  numero,
  actual,
  abierto,
  onCerrar,
}: {
  polizaId: string;
  numero: string;
  actual: ColumnaEmbudo;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v && !pendiente) {
          setMotivo("");
          setNota("");
          setError(null);
          onCerrar();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!motivo) {
              setError("Elige el motivo.");
              return;
            }
            startTransition(async () => {
              const r = await cambiarEtapaRenovacion(polizaId, "perdida", { motivo, nota });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              onCerrar();
              toast("Renovación marcada como perdida", {
                description: `Póliza ${numero} · ${motivo}`,
                ...deshacerHacia(polizaId, actual),
              });
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>No se renovó la póliza {numero}</DialogTitle>
            <DialogDescription>
              El motivo queda en el embudo y en la bitácora; sirve para saber por qué se pierden renovaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`perdida-motivo-${polizaId}`}>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger id={`perdida-motivo-${polizaId}`} className="w-full">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_PERDIDA.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`perdida-nota-${polizaId}`}>Detalle (opcional)</Label>
            <Textarea id={`perdida-nota-${polizaId}`} value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={300} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pendiente}>
                Volver
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <XCircle />} Marcar como perdida
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
