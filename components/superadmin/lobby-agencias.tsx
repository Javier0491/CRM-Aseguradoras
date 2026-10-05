"use client";

import * as React from "react";
import {
  ArrowRight,
  Ban,
  Building2,
  CircleCheck,
  EllipsisVertical,
  FileText,
  Loader2,
  Moon,
  Plus,
  Sun,
  Users,
} from "lucide-react";

import { LogoAgencia } from "@/components/layout/logo-agencia";
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
import { Textarea } from "@/components/ui/textarea";
import { COLOR_MARCA_PREDETERMINADO } from "@/lib/agencias/marca";
import type { AgenciaLobby } from "@/lib/agencias/queries";
import {
  cambiarAgenciaActiva,
  cambiarSuspensionAgencia,
  crearAgencia,
  type CrearAgenciaState,
} from "@/lib/agencias/superadmin";
import { colorTextoSobre, normalizarHex } from "@/lib/color";
import { formatFecha, formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Panel de agencias del SUPERADMIN: una tarjeta por agencia (clic = operar esa agencia) y una para
 * crear una nueva. Cada tarjeta usa el color de marca de su agencia como acento; su menú suspende
 * o reactiva la agencia.
 */
export function LobbyAgencias({
  agencias,
  activaId,
  propiaId,
}: {
  agencias: AgenciaLobby[];
  activaId: string;
  propiaId: string;
}) {
  const [entrando, setEntrando] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  const [nueva, setNueva] = React.useState<string | null>(null);
  const [aSuspender, setASuspender] = React.useState<AgenciaLobby | null>(null);

  function entrar(id: string) {
    if (entrando) return;
    setError(null);
    setEntrando(id);
    startTransition(async () => {
      // Si sale bien la acción redirige al dashboard de la agencia; solo regresa con un error.
      const r = await cambiarAgenciaActiva(id);
      if (r && !r.ok) {
        setError(r.error);
        setEntrando(null);
      }
    });
  }

  async function reactivar(id: string) {
    setError(null);
    const r = await cambiarSuspensionAgencia(id, false);
    if (!r.ok) setError(r.error);
  }

  return (
    <>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agencias.map((a) => (
          <TarjetaAgencia
            key={a.id}
            agencia={a}
            activa={a.id === activaId}
            propia={a.id === propiaId}
            recienCreada={a.id === nueva}
            entrando={entrando === a.id}
            bloqueada={entrando !== null}
            onEntrar={() => entrar(a.id)}
            onSuspender={() => setASuspender(a)}
            onReactivar={() => reactivar(a.id)}
          />
        ))}
        <NuevaAgencia onCreada={setNueva} />
      </div>
      <SuspenderAgencia agencia={aSuspender} onCerrar={() => setASuspender(null)} />
    </>
  );
}

function TarjetaAgencia({
  agencia: a,
  activa,
  propia,
  recienCreada,
  entrando,
  bloqueada,
  onEntrar,
  onSuspender,
  onReactivar,
}: {
  agencia: AgenciaLobby;
  activa: boolean;
  propia: boolean;
  recienCreada: boolean;
  entrando: boolean;
  bloqueada: boolean;
  onEntrar: () => void;
  onSuspender: () => void;
  onReactivar: () => Promise<void>;
}) {
  const [cambiando, startCambio] = React.useTransition();
  const color = normalizarHex(a.colorHex) ?? COLOR_MARCA_PREDETERMINADO;
  // --primary local: el monograma, el borde y el fondo al pasar el mouse usan el color de la agencia.
  const acento = { "--primary": color, "--primary-foreground": colorTextoSobre(color) } as React.CSSProperties;
  const TemaIcono = a.tema === "light" ? Sun : Moon;

  return (
    // El menú va fuera del botón de la tarjeta: no se anidan botones.
    <div className="relative">
      <button
        type="button"
        onClick={onEntrar}
        disabled={bloqueada}
        style={acento}
        aria-label={`Entrar a ${a.nombre}`}
        className={cn(
          "group relative flex min-h-44 flex-col overflow-hidden rounded-xl border bg-card p-5 text-left transition-all",
          "hover:-translate-y-0.5 hover:border-primary hover:bg-primary/[0.06] hover:shadow-lg",
          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
          "disabled:cursor-wait disabled:hover:translate-y-0",
          (activa || recienCreada) && "border-primary/60",
          a.suspendida && "border-destructive/50 bg-destructive/[0.04]",
          bloqueada && !entrando && "opacity-50"
        )}
      >
        {/* Franja con el color de marca. */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary opacity-70 transition-opacity group-hover:opacity-100" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-14 items-center justify-center rounded-lg border bg-background p-2">
            <LogoAgencia nombre={a.nombre} logoUrl={a.logoUrl} className="size-10" />
          </div>
          <div className="flex flex-wrap justify-end gap-1.5 pr-8">
            {a.suspendida && <Etiqueta className="border-destructive/50 bg-destructive/10 text-destructive">Suspendida</Etiqueta>}
            {recienCreada && <Etiqueta className="border-primary/50 text-primary">Nueva</Etiqueta>}
            {activa && <Etiqueta className="border-primary/50 bg-primary/10 text-primary">Operando</Etiqueta>}
            {propia && <Etiqueta>Propia</Etiqueta>}
          </div>
        </div>

        <h2 className="mt-4 truncate text-base font-semibold tracking-wide uppercase">{a.nombre}</h2>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" /> {formatNumero(a._count.usuarios)}
          </span>
          <span className="flex items-center gap-1">
            <Building2 className="size-3.5" /> {formatNumero(a._count.clientes)} clientes
          </span>
          <span className="flex items-center gap-1">
            <FileText className="size-3.5" /> {formatNumero(a._count.polizas)} pólizas
          </span>
        </p>
        {a.suspendida && (
          <p className="mt-2 line-clamp-2 text-xs text-destructive">
            Suspendida{a.suspendidaAt ? ` el ${formatFecha(a.suspendidaAt)}` : ""}
            {a.motivoSuspension ? ` · ${a.motivoSuspension}` : ""}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-primary" />
            <span className="font-mono">{color}</span>
            <TemaIcono className="ml-1 size-3.5" aria-label={a.tema === "light" ? "Modo claro" : "Modo oscuro"} />
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground/80 transition-colors group-hover:text-primary">
            {entrando ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Entrando…
              </>
            ) : (
              <>
                {activa ? "Volver al CRM" : "Entrar"} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </span>
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={bloqueada || cambiando}
            aria-label={`Opciones de ${a.nombre}`}
            className="absolute top-4 right-3 size-7 text-muted-foreground"
          >
            {cambiando ? <Loader2 className="animate-spin" /> : <EllipsisVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {a.suspendida ? (
            <DropdownMenuItem onSelect={() => startCambio(onReactivar)}>
              <CircleCheck /> Reactivar agencia
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" disabled={propia} onSelect={onSuspender}>
              <Ban /> {propia ? "Tu agencia no se puede suspender" : "Suspender agencia"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Confirmación para suspender una agencia, con un motivo opcional (p. ej. falta de pago). */
function SuspenderAgencia({ agencia, onCerrar }: { agencia: AgenciaLobby | null; onCerrar: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function suspender(formData: FormData) {
    if (!agencia) return;
    setError(null);
    startTransition(async () => {
      const r = await cambiarSuspensionAgencia(agencia.id, true, String(formData.get("motivo") ?? ""));
      if (r.ok) onCerrar();
      else setError(r.error);
    });
  }

  return (
    <Dialog
      open={agencia !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          setError(null);
          onCerrar();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form action={suspender} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Suspender {agencia?.nombre}</DialogTitle>
            <DialogDescription>
              Ninguno de sus usuarios podrá entrar al CRM y se detienen sus avisos automáticos. No se borra nada: al
              reactivarla todo sigue como estaba. Tú puedes seguir entrando a ella.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-suspension">Motivo (opcional)</Label>
            <Textarea id="motivo-suspension" name="motivo" placeholder="Ej. Falta de pago" maxLength={200} rows={2} />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Ban />} Suspender
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Etiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground", className)}>
      {children}
    </span>
  );
}

/** Tarjeta "+ Nuevo CRM / Agencia" con su diálogo. La agencia creada aparece en el grid al momento. */
function NuevaAgencia({ onCreada }: { onCreada: (id: string) => void }) {
  const [abierto, setAbierto] = React.useState(false);
  const [state, action, pendiente] = React.useActionState(
    async (prev: CrearAgenciaState, formData: FormData) => {
      const r = await crearAgencia(prev, formData);
      if (r.ok && r.agencia) {
        onCreada(r.agencia.id);
        setAbierto(false);
      }
      return r;
    },
    {}
  );

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-5 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/[0.04] hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
      >
        <span className="flex size-12 items-center justify-center rounded-full border border-current/30">
          <Plus className="size-5" />
        </span>
        <span className="text-sm font-medium">Nuevo CRM / Agencia</span>
      </button>
      <DialogContent className="sm:max-w-md">
        <form action={action} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Nueva agencia</DialogTitle>
            <DialogDescription>
              Se crea vacía, con la marca predeterminada. Después entra a ella para subir su logo, elegir su color y
              dar de alta a su primer administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nombre-agencia">Nombre</Label>
            <Input
              id="nombre-agencia"
              name="nombre"
              placeholder="Ej. Seguros Ruiz"
              maxLength={80}
              required
              autoFocus
              aria-invalid={Boolean(state.error)}
            />
            {state.error && <p className="text-xs text-destructive">{state.error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Plus />} Crear agencia
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
