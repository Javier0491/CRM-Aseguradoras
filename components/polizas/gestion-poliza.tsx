"use client";

import * as React from "react";
import { Ban, EllipsisVertical, FilePenLine, Loader2, RotateCcw } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatFecha } from "@/lib/format";
import {
  etiquetaEndoso,
  MOTIVOS_CANCELACION,
  TIPOS_ENDOSO,
  type EndosoValores,
  type ErroresEndoso,
} from "@/lib/polizas/estatus";
import { cancelarPoliza, reactivarPoliza, registrarEndoso } from "@/lib/polizas/estatus-actions";
import { conDeshacer } from "@/lib/toast";

type Dialogo = "endoso" | "cancelar" | "reactivar" | null;

/**
 * Menú de gestión de la póliza: registrar un endoso y cancelarla o reactivarla. Cada opción abre
 * su diálogo de confirmación.
 */
export function GestionPoliza({
  polizaId,
  numero,
  cancelada,
  vigencia,
  hoy,
  recibosPendientes,
  recibosCancelados,
}: {
  polizaId: string;
  numero: string;
  cancelada: boolean;
  /** Fechas YYYY-MM-DD. */
  vigencia: { inicio: string; fin: string };
  hoy: string;
  recibosPendientes: number;
  recibosCancelados: number;
}) {
  const [dialogo, setDialogo] = React.useState<Dialogo>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Más acciones de la póliza">
            <EllipsisVertical /> <span className="sm:hidden">Más</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {!cancelada && (
            <DropdownMenuItem onSelect={() => setDialogo("endoso")}>
              <FilePenLine /> Registrar endoso
            </DropdownMenuItem>
          )}
          {cancelada ? (
            <DropdownMenuItem onSelect={() => setDialogo("reactivar")}>
              <RotateCcw /> Reactivar póliza
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialogo("cancelar")}>
              <Ban /> Cancelar póliza
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogo !== null} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          {dialogo === "endoso" && (
            <FormEndoso polizaId={polizaId} numero={numero} vigencia={vigencia} hoy={hoy} onListo={() => setDialogo(null)} />
          )}
          {dialogo === "cancelar" && (
            <FormCancelar
              polizaId={polizaId}
              numero={numero}
              vigencia={vigencia}
              hoy={hoy}
              recibosPendientes={recibosPendientes}
              onListo={() => setDialogo(null)}
            />
          )}
          {dialogo === "reactivar" && (
            <FormReactivar
              polizaId={polizaId}
              numero={numero}
              recibosCancelados={recibosCancelados}
              onListo={() => setDialogo(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Fecha predeterminada dentro de la vigencia: hoy, o el extremo más cercano. */
const dentroDeVigencia = (hoy: string, v: { inicio: string; fin: string }) =>
  hoy < v.inicio ? v.inicio : hoy > v.fin ? v.fin : hoy;

function FormCancelar({
  polizaId,
  numero,
  vigencia,
  hoy,
  recibosPendientes,
  onListo,
}: {
  polizaId: string;
  numero: string;
  vigencia: { inicio: string; fin: string };
  hoy: string;
  recibosPendientes: number;
  onListo: () => void;
}) {
  const [fecha, setFecha] = React.useState(dentroDeVigencia(hoy, vigencia));
  const [motivo, setMotivo] = React.useState<string>("");
  const [detalle, setDetalle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo) {
      setError("Elige el motivo.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await cancelarPoliza(polizaId, { fecha, motivo, detalle });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onListo();
      // Deshacer = reactivarla: vuelve a estar en vigor con sus recibos pendientes.
      toast(`Póliza ${numero} cancelada`, {
        description:
          recibosPendientes === 0
            ? motivo
            : `${motivo} · ${recibosPendientes === 1 ? "su recibo pendiente" : `${recibosPendientes} recibos pendientes`} cancelado${recibosPendientes === 1 ? "" : "s"}`,
        ...conDeshacer(() => reactivarPoliza(polizaId), `La póliza ${numero} vuelve a estar en vigor.`),
      });
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Cancelar la póliza {numero}</DialogTitle>
        <DialogDescription>
          La póliza se conserva con su historia; deja de contar como vigente y no se renueva.
          {recibosPendientes > 0 &&
            ` ${recibosPendientes === 1 ? "Su recibo pendiente se cancela" : `Sus ${recibosPendientes} recibos pendientes se cancelan`} y ya no genera avisos de cobro.`}{" "}
          Puedes reactivarla después.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cancelacion-fecha">Fecha efectiva</Label>
          <Input
            id="cancelacion-fecha"
            type="date"
            value={fecha}
            min={vigencia.inicio}
            max={vigencia.fin}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cancelacion-motivo">Motivo</Label>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger id="cancelacion-motivo" className="w-full">
              <SelectValue placeholder="Selecciona…" />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS_CANCELACION.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cancelacion-detalle">Detalle (opcional)</Label>
        <Textarea id="cancelacion-detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} maxLength={300} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pendiente}>
            Volver
          </Button>
        </DialogClose>
        <Button type="submit" variant="destructive" disabled={pendiente}>
          {pendiente ? <Loader2 className="animate-spin" /> : <Ban />} Cancelar póliza
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormReactivar({
  polizaId,
  numero,
  recibosCancelados,
  onListo,
}: {
  polizaId: string;
  numero: string;
  recibosCancelados: number;
  onListo: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Reactivar la póliza {numero}</DialogTitle>
        <DialogDescription>
          Vuelve a estar en vigor
          {recibosCancelados > 0 &&
            ` y ${recibosCancelados === 1 ? "su recibo cancelado vuelve" : `sus ${recibosCancelados} recibos cancelados vuelven`} a pendiente de cobro`}
          .
        </DialogDescription>
      </DialogHeader>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pendiente}>
            Volver
          </Button>
        </DialogClose>
        <Button
          type="button"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              const r = await reactivarPoliza(polizaId);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              onListo();
              toast.success(`Póliza ${numero} reactivada`, {
                description:
                  recibosCancelados === 0
                    ? undefined
                    : recibosCancelados === 1
                      ? "Su recibo vuelve a pendiente de cobro."
                      : `${recibosCancelados} recibos vuelven a pendiente de cobro.`,
              });
            })
          }
        >
          {pendiente ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reactivar
        </Button>
      </DialogFooter>
    </div>
  );
}

function FormEndoso({
  polizaId,
  numero,
  vigencia,
  hoy,
  onListo,
}: {
  polizaId: string;
  numero: string;
  vigencia: { inicio: string; fin: string };
  hoy: string;
  onListo: () => void;
}) {
  const [valores, setValores] = React.useState<EndosoValores>({
    tipo: "",
    fecha: dentroDeVigencia(hoy, vigencia),
    numero: "",
    descripcion: "",
    prima: "",
  });
  const [errores, setErrores] = React.useState<ErroresEndoso>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();
  const campo = (k: keyof EndosoValores) => (v: string) => {
    setValores((p) => ({ ...p, [k]: v }));
    setErrores((p) => ({ ...p, [k]: undefined }));
  };

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await registrarEndoso(polizaId, valores);
      if (r.ok) {
        onListo();
        toast.success("Endoso registrado", { description: `Póliza ${numero} · ${etiquetaEndoso(valores.tipo)}` });
      } else {
        setErrores(r.errores ?? {});
        setError(r.error ?? null);
      }
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Endoso de la póliza {numero}</DialogTitle>
        <DialogDescription>
          Cambio durante la vigencia ({formatFecha(`${vigencia.inicio}T00:00:00Z`)} – {formatFecha(`${vigencia.fin}T00:00:00Z`)}).
          Si cambian los asegurados, actualízalos también en Editar.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="endoso-tipo">Tipo</Label>
          <Select value={valores.tipo} onValueChange={campo("tipo")}>
            <SelectTrigger id="endoso-tipo" className="w-full" aria-invalid={Boolean(errores.tipo)}>
              <SelectValue placeholder="Selecciona…" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_ENDOSO.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errores.tipo && <p className="text-xs text-destructive">{errores.tipo}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="endoso-fecha">Fecha efectiva</Label>
          <Input
            id="endoso-fecha"
            type="date"
            value={valores.fecha}
            min={vigencia.inicio}
            max={vigencia.fin}
            onChange={(e) => campo("fecha")(e.target.value)}
            aria-invalid={Boolean(errores.fecha)}
          />
          {errores.fecha && <p className="text-xs text-destructive">{errores.fecha}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="endoso-numero">Número de endoso (opcional)</Label>
          <Input id="endoso-numero" value={valores.numero} onChange={(e) => campo("numero")(e.target.value)} maxLength={60} />
          {errores.numero && <p className="text-xs text-destructive">{errores.numero}</p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="endoso-descripcion">Descripción</Label>
          <Textarea
            id="endoso-descripcion"
            value={valores.descripcion}
            onChange={(e) => campo("descripcion")(e.target.value)}
            rows={3}
            placeholder="Ej. Alta de la hija María López, 12 años"
            aria-invalid={Boolean(errores.descripcion)}
          />
          {errores.descripcion && <p className="text-xs text-destructive">{errores.descripcion}</p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="endoso-prima">Movimiento de prima (opcional)</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              id="endoso-prima"
              inputMode="decimal"
              value={valores.prima}
              onChange={(e) => campo("prima")(e.target.value)}
              placeholder="0.00"
              className="pl-7 tabular-nums"
              aria-invalid={Boolean(errores.prima)}
            />
          </div>
          <p className={errores.prima ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {errores.prima ?? "Positivo si es un cobro adicional; negativo (con −) si es devolución."}
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pendiente}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? <Loader2 className="animate-spin" /> : <FilePenLine />} Registrar endoso
        </Button>
      </DialogFooter>
    </form>
  );
}
