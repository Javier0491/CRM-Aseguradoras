"use client";

import * as React from "react";
import { BadgeDollarSign, Loader2, Receipt, Save, Settings2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatFecha, formatMoneda } from "@/lib/format";
import {
  CICLOS,
  definicionPlan,
  EDICIONES,
  esCiclo,
  esEdicion,
  esPlan,
  ETIQUETA_CICLO,
  ETIQUETA_EDICION,
  hayCupo,
  PLANES,
  PLANES_ORDEN,
  textoUso,
  type CicloFacturacion,
  type EdicionPlan,
  type PlanAgencia,
} from "@/lib/planes/planes";
import { configurarCobranza, registrarPagoPlataforma } from "@/lib/plataforma/actions";
import {
  DIAS_AVISO_COBRO,
  detalleCobro,
  ETIQUETA_ESTADO_COBRO,
  MAX_DIAS_TOLERANCIA,
  MAX_MESES_PAGO,
  siguientePagadoHasta,
  type EstadoCobro,
} from "@/lib/plataforma/cobranza";
import type { CobranzaAgencia } from "@/lib/plataforma/queries";
import { cn } from "@/lib/utils";

export const ESTILO_ESTADO_COBRO: Record<EstadoCobro, string> = {
  sin_configurar: "border-border text-muted-foreground",
  al_corriente: "border-success/40 bg-success/10 text-success",
  por_vencer: "border-warning/40 bg-warning/10 text-warning",
  vencida: "border-destructive/40 bg-destructive/10 text-destructive",
  suspendible: "border-destructive/60 bg-destructive/15 text-destructive",
};

const fecha = (iso: string) => formatFecha(`${iso}T00:00:00Z`);

function describirLimites(plan: PlanAgencia, edicion: EdicionPlan) {
  const { usuarios, ocrMensual } = definicionPlan(plan, edicion);
  if (usuarios === null && ocrMensual === null) return "Usuarios y escaneos con IA sin límite.";
  return `${usuarios === null ? "Usuarios ilimitados" : `${usuarios} ${usuarios === 1 ? "usuario" : "usuarios"}`} · ${
    ocrMensual === null ? "escaneos sin límite" : ocrMensual === 0 ? "sin captura con IA" : `${ocrMensual} escaneos con IA al mes`
  }.`;
}

function describirPrecio(plan: PlanAgencia, edicion: EdicionPlan, ciclo: CicloFacturacion) {
  const { precio } = definicionPlan(plan, edicion);
  return `Lista: ${formatMoneda(precio[ciclo])} ${ciclo === "ANUAL" ? "al año" : "al mes"}.`;
}

/** Tabla de cobranza de la plataforma: estado de pago de cada agencia, su configuración y sus pagos. */
export function CobranzaPlataforma({ agencias, hoy }: { agencias: CobranzaAgencia[]; hoy: string }) {
  const [configurar, setConfigurar] = React.useState<CobranzaAgencia | null>(null);
  const [pago, setPago] = React.useState<CobranzaAgencia | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Agencia</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Cuota mensual</TableHead>
            <TableHead>Pagado hasta</TableHead>
            <TableHead>Último pago</TableHead>
            <TableHead className="pr-5 text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agencias.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                Aún no hay agencias en la plataforma.
              </TableCell>
            </TableRow>
          )}
          {agencias.map((a) => (
            <TableRow key={a.id}>
              {/* El nombre (hasta 80 caracteres) se parte: así Configurar y Registrar pago quedan a la vista. */}
              <TableCell className="max-w-64 min-w-40 pl-5 font-medium whitespace-normal wrap-anywhere">
                {a.nombre}
                {a.suspendida && <p className="text-[11px] font-normal text-destructive">Suspendida</p>}
              </TableCell>
              <TableCell className="min-w-40 whitespace-normal">
                <p className="text-sm font-medium">
                  {a.nombrePlan} <span className="font-normal text-muted-foreground">· {ETIQUETA_CICLO[a.ciclo]}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {/* En ámbar lo que ya no admite uno más este mes. */}
                  <span className={cn("block", !hayCupo(a.usuarios.usados, a.usuarios.limite) && "font-medium text-warning")}>
                    Usuarios: {textoUso(a.usuarios.usados, a.usuarios.limite)}
                  </span>
                  <span className={cn("block", !hayCupo(a.ocr.usados, a.ocr.limite) && "font-medium text-warning")}>
                    Escaneos IA: {textoUso(a.ocr.usados, a.ocr.limite)}
                  </span>
                </p>
              </TableCell>
              <TableCell className="min-w-48 whitespace-normal">
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", ESTILO_ESTADO_COBRO[a.estado])}>
                  {ETIQUETA_ESTADO_COBRO[a.estado]}
                </span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {detalleCobro(a)}
                  {a.cuotaMensual !== null && (a.suspensionAutomatica ? " · suspensión automática" : " · sin suspensión automática")}
                </p>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {a.cuotaMensual === null ? "—" : formatMoneda(a.cuotaMensual)}
              </TableCell>
              <TableCell className="tabular-nums">{a.pagadoHasta ? fecha(a.pagadoHasta) : "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {a.pagos[0] ? `${formatMoneda(a.pagos[0].monto)} el ${fecha(a.pagos[0].fecha)}` : "—"}
              </TableCell>
              <TableCell className="pr-5">
                <div className="flex justify-end gap-1.5">
                  <Button variant="outline" size="sm" className="h-7" onClick={() => setConfigurar(a)}>
                    <Settings2 /> Configurar
                  </Button>
                  <Button size="sm" className="h-7" disabled={a.cuotaMensual === null} onClick={() => setPago(a)}>
                    <BadgeDollarSign /> Registrar pago
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={configurar !== null} onOpenChange={(v) => !v && setConfigurar(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          {configurar && <FormConfigurar agencia={configurar} hoy={hoy} onListo={() => setConfigurar(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={pago !== null} onOpenChange={(v) => !v && setPago(null)}>
        <DialogContent className="sm:max-w-md">
          {pago && <FormPago agencia={pago} hoy={hoy} onListo={() => setPago(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormConfigurar({ agencia, hoy, onListo }: { agencia: CobranzaAgencia; hoy: string; onListo: () => void }) {
  const [plan, setPlan] = React.useState<PlanAgencia>(agencia.plan);
  const [edicion, setEdicion] = React.useState<EdicionPlan>(agencia.edicion);
  const definicion = definicionPlan(plan, edicion);
  const [ciclo, setCiclo] = React.useState<CicloFacturacion>(agencia.ciclo);
  const [cuota, setCuota] = React.useState(agencia.cuotaMensual === null ? "" : agencia.cuotaMensual.toFixed(2));
  const [pagadoHasta, setPagadoHasta] = React.useState(agencia.pagadoHasta ?? hoy);
  const [tolerancia, setTolerancia] = React.useState(String(agencia.diasTolerancia));
  const [automatica, setAutomatica] = React.useState(agencia.suspensionAutomatica);
  const [correo, setCorreo] = React.useState(agencia.correoFacturacion ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await configurarCobranza(agencia.id, {
        plan,
        edicion,
        ciclo,
        cuotaMensual: cuota,
        pagadoHasta: cuota.trim() ? pagadoHasta : "",
        diasTolerancia: tolerancia,
        suspensionAutomatica: automatica,
        correoFacturacion: correo,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onListo();
      toast.success("Cobranza guardada", { description: agencia.nombre });
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Cobranza de {agencia.nombre}</DialogTitle>
        <DialogDescription>
          Plan contratado, cuota mensual del servicio y hasta qué fecha está pagado. Deja la cuota vacía si esta agencia
          no paga (p. ej. la tuya).
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cobro-plan">Plan</Label>
          <Select value={plan} onValueChange={(v) => esPlan(v) && setPlan(v)}>
            <SelectTrigger id="cobro-plan" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLANES_ORDEN.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLANES[p].nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{describirLimites(plan, edicion)}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cobro-edicion">Edición</Label>
          <Select value={edicion} onValueChange={(v) => esEdicion(v) && setEdicion(v)}>
            <SelectTrigger id="cobro-edicion" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDICIONES.map((e) => (
                <SelectItem key={e} value={e}>
                  {ETIQUETA_EDICION[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Cada edición tiene sus límites y su precio.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cobro-ciclo">Ciclo de cobro</Label>
          <Select value={ciclo} onValueChange={(v) => esCiclo(v) && setCiclo(v)}>
            <SelectTrigger id="cobro-ciclo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CICLOS.map((c) => (
                <SelectItem key={c} value={c}>
                  {ETIQUETA_CICLO[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{describirPrecio(plan, edicion, ciclo)}</p>
        </div>
      </div>
      {plan !== agencia.plan && definicion.usuarios !== null && agencia.usuarios.usados > definicion.usuarios && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Tiene {agencia.usuarios.usados} cuentas activas y el plan {definicion.nombre} incluye {definicion.usuarios}. No se
          desactiva ninguna: solo no podrá agregar más hasta quedar dentro del límite.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cobro-cuota">Cuota mensual</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input id="cobro-cuota" inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} className="pl-7 tabular-nums" placeholder="Sin cobro" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cobro-hasta">Pagado hasta</Label>
          <Input id="cobro-hasta" type="date" value={pagadoHasta} onChange={(e) => setPagadoHasta(e.target.value)} disabled={!cuota.trim()} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cobro-tolerancia">Días de tolerancia</Label>
          <Input
            id="cobro-tolerancia"
            type="number"
            min={0}
            max={MAX_DIAS_TOLERANCIA}
            value={tolerancia}
            onChange={(e) => setTolerancia(e.target.value)}
            className="tabular-nums"
          />
          <p className="text-xs text-muted-foreground">Después de vencer, antes de suspender.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cobro-correo">Correo de facturación</Label>
          <Input id="cobro-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Los administradores" />
          <p className="text-xs text-muted-foreground">Recibe los avisos de cobro; vacío = a sus administradores.</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-1">
          <Label htmlFor="cobro-automatica">Suspender automáticamente</Label>
          <p className="text-xs text-muted-foreground">
            La tarea diaria suspende la agencia al pasar la tolerancia y le avisa por correo. Siempre recibe un aviso{" "}
            {DIAS_AVISO_COBRO} días antes de vencer.
          </p>
        </div>
        <Switch id="cobro-automatica" checked={automatica} onCheckedChange={setAutomatica} disabled={!cuota.trim()} />
      </div>
      {agencia.pagos.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Receipt className="size-4 text-primary" /> Últimos pagos
          </p>
          <ul className="divide-y rounded-lg border text-xs">
            {agencia.pagos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="tabular-nums">
                  {fecha(p.fecha)} · <span className="font-medium">{formatMoneda(p.monto)}</span>
                </span>
                <span className="text-muted-foreground">hasta el {fecha(p.cubreHasta)}</span>
                {p.nota && <span className="w-full text-muted-foreground">{p.nota}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pendiente}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormPago({ agencia, hoy, onListo }: { agencia: CobranzaAgencia; hoy: string; onListo: () => void }) {
  const [fechaPago, setFechaPago] = React.useState(hoy);
  // Cobro anual: el pago cubre el año completo.
  const [meses, setMeses] = React.useState(agencia.ciclo === "ANUAL" ? 12 : 1);
  const [importe, setImporte] = React.useState(agencia.cuotaMensual === null ? "" : (agencia.cuotaMensual * meses).toFixed(2));
  const [nota, setNota] = React.useState("");
  const [reactivar, setReactivar] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();
  const cubreHasta = siguientePagadoHasta(agencia.pagadoHasta, hoy, meses);

  function cambiarMeses(v: string) {
    const n = Math.min(MAX_MESES_PAGO, Math.max(1, Math.trunc(Number(v)) || 1));
    setMeses(n);
    if (agencia.cuotaMensual !== null) setImporte((agencia.cuotaMensual * n).toFixed(2));
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await registrarPagoPlataforma(agencia.id, { fecha: fechaPago, monto: importe, meses, nota, reactivar });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onListo();
      toast.success(`Pago de ${agencia.nombre} registrado`, { description: r.mensaje });
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Pago de {agencia.nombre}</DialogTitle>
        <DialogDescription>
          {agencia.pagadoHasta ? `Pagado hasta el ${fecha(agencia.pagadoHasta)}.` : "Sin pagos registrados."} El pago
          recorre esa fecha los meses que cubre.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pago-fecha">Fecha del pago</Label>
          <Input id="pago-fecha" type="date" value={fechaPago} max={hoy} onChange={(e) => setFechaPago(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pago-meses">Meses que cubre</Label>
          <Input
            id="pago-meses"
            type="number"
            min={1}
            max={MAX_MESES_PAGO}
            value={meses}
            onChange={(e) => cambiarMeses(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pago-monto">Monto recibido</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input id="pago-monto" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} className="pl-7 tabular-nums" />
          </div>
          <p className="text-xs text-muted-foreground">Quedará pagado hasta el {fecha(cubreHasta)}.</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pago-nota">Nota (opcional)</Label>
          <Textarea id="pago-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={300} placeholder="Ej. Transferencia SPEI, folio 12345" />
        </div>
      </div>
      {agencia.suspendida && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <Label htmlFor="pago-reactivar" className="text-sm">
            La agencia está suspendida: reactivarla con este pago
          </Label>
          <Switch id="pago-reactivar" checked={reactivar} onCheckedChange={setReactivar} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pendiente}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? <Loader2 className="animate-spin" /> : <BadgeDollarSign />} Registrar pago
        </Button>
      </DialogFooter>
    </form>
  );
}
