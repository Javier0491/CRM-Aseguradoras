"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Check, CheckCircle2, Circle, FileText, Trash2, User, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFecha, iniciales } from "@/lib/format";
import {
  cambiarEstadoTarea,
  cambiarFechaTarea,
  eliminarTarea,
  marcarParteTarea,
  restaurarTarea,
} from "@/lib/tareas/actions";
import { avanceTarea, grupoTarea, sumarDiasIso } from "@/lib/tareas/reglas";
import { conDeshacer } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type TareaVista = {
  id: string;
  titulo: string;
  descripcion: string | null;
  vence: Date;
  completadaAt: Date | null;
  creadaPorEmail: string | null;
  /** Encargados con su parte: hecha (completadaAt) o pendiente. */
  responsables: { usuarioId: string; completadaAt: Date | null; usuario: { nombre: string } }[];
  cliente: { id: string; nombre: string } | null;
  poliza: { id: string; numeroImpreso: string } | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lista de tareas. Cada encargado marca su parte con la casilla; la tarea queda hecha cuando todos
 * terminan y, mientras, se ve su avance. `contexto` oculta el enlace al registro en el que ya se
 * está (p. ej. dentro del expediente del cliente); `enlaces={false}` muestra cliente y póliza sin
 * liga (para quien solo usa Tareas). `coordina` deja marcar la parte de cualquiera.
 */
export function ListaTareas({
  tareas,
  hoy,
  usuarioId,
  usuarioEmail = null,
  contexto,
  mostrarResponsable = true,
  coordina = false,
  enlaces = true,
  vacio = "Sin tareas pendientes.",
}: {
  tareas: TareaVista[];
  hoy: string;
  usuarioId: string;
  usuarioEmail?: string | null;
  contexto?: "cliente" | "poliza";
  mostrarResponsable?: boolean;
  coordina?: boolean;
  enlaces?: boolean;
  vacio?: string;
}) {
  if (tareas.length === 0) return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="divide-y">
      {tareas.map((t) => (
        <FilaTarea
          key={t.id}
          tarea={t}
          hoy={hoy}
          usuarioId={usuarioId}
          usuarioEmail={usuarioEmail}
          contexto={contexto}
          mostrarResponsable={mostrarResponsable}
          coordina={coordina}
          enlaces={enlaces}
        />
      ))}
    </ul>
  );
}

function FilaTarea({
  tarea: t,
  hoy,
  usuarioId,
  usuarioEmail,
  contexto,
  mostrarResponsable,
  coordina,
  enlaces,
}: {
  tarea: TareaVista;
  hoy: string;
  usuarioId: string;
  usuarioEmail: string | null;
  contexto?: "cliente" | "poliza";
  mostrarResponsable: boolean;
  coordina: boolean;
  enlaces: boolean;
}) {
  // Posponer y borrar esperan al servidor (la fila se atenúa); marcar es optimista.
  const [pendiente, startTransition] = React.useTransition();
  const [marcando, startMarcar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const partesReales = t.responsables.map((r) => ({ id: r.usuarioId, nombre: r.usuario.nombre, hecha: r.completadaAt !== null }));
  // Las palomitas aparecen al instante, sin esperar al servidor; si falla, regresan solas.
  const [partes, marcarOptimista] = React.useOptimistic(
    partesReales,
    (actuales, cambio: { id: string; hecha: boolean }) => actuales.map((p) => (p.id === cambio.id ? { ...p, hecha: cambio.hecha } : p))
  );
  const [sinEncargadosHecha, setSinEncargadosHecha] = React.useOptimistic(t.completadaAt !== null);

  const miParte = partes.find((p) => p.id === usuarioId);
  const sinEncargados = partes.length === 0;
  const completada = sinEncargados ? sinEncargadosHecha : partes.every((p) => p.hecha);
  const avance = avanceTarea(partes, completada);
  const grupo = grupoTarea({ vence: iso(t.vence), completada }, hoy);
  const puedeBorrar =
    coordina ||
    (usuarioEmail !== null && t.creadaPorEmail?.toLowerCase() === usuarioEmail.toLowerCase()) ||
    (partes.length === 1 && miParte !== undefined);

  /** Mi casilla: mi parte, o la tarea entera si no tiene encargados. */
  function alternar() {
    setError(null);
    const marcar = !(miParte ? miParte.hecha : completada);
    startMarcar(async () => {
      if (miParte) marcarOptimista({ id: usuarioId, hecha: marcar });
      else setSinEncargadosHecha(marcar);
      const r = await cambiarEstadoTarea(t.id, marcar);
      if (!r.ok) {
        setError(r.error ?? "No se pudo actualizar.");
        return;
      }
      if (!marcar) {
        toast(miParte && partes.length > 1 ? "Tu parte vuelve a estar pendiente" : "Tarea reabierta", { description: t.titulo });
        return;
      }
      const faltan = partes.filter((p) => !p.hecha && p.id !== usuarioId).length;
      toast.success(faltan > 0 ? "Tu parte quedó lista" : "Tarea completada", {
        description: faltan > 0 ? `${t.titulo} · ${faltan === 1 ? "falta 1 encargado" : `faltan ${faltan} encargados`}` : t.titulo,
        ...conDeshacer(() => cambiarEstadoTarea(t.id, false), "Vuelve a estar pendiente."),
      });
    });
  }

  /** Quien coordina marca la parte de otro encargado. */
  function alternarParte(p: { id: string; nombre: string; hecha: boolean }) {
    setError(null);
    startMarcar(async () => {
      marcarOptimista({ id: p.id, hecha: !p.hecha });
      const r = await marcarParteTarea(t.id, p.id, !p.hecha);
      if (!r.ok) {
        setError(r.error ?? "No se pudo actualizar.");
        return;
      }
      toast.success(p.hecha ? `${p.nombre}: pendiente` : `${p.nombre}: listo`, {
        description: t.titulo,
        ...conDeshacer(() => marcarParteTarea(t.id, p.id, p.hecha), "Se deshizo el cambio."),
      });
    });
  }

  function borrar() {
    setError(null);
    startTransition(async () => {
      const r = await eliminarTarea(t.id);
      if (!r.ok) {
        setError(r.error ?? "No se pudo borrar.");
        return;
      }
      toast("Tarea borrada", {
        description: t.titulo,
        // Deshacer la recupera tal cual: con sus encargados y su avance.
        ...conDeshacer(() => restaurarTarea(t.id), "Tarea recuperada."),
      });
    });
  }

  function posponer(fecha: string) {
    setError(null);
    const anterior = iso(t.vence);
    startTransition(async () => {
      const r = await cambiarFechaTarea(t.id, fecha);
      if (!r.ok) {
        setError(r.error ?? "No se pudo cambiar la fecha.");
        return;
      }
      toast.success(fecha === hoy ? "Tarea movida a hoy" : `Tarea pospuesta al ${formatFecha(`${fecha}T00:00:00Z`)}`, {
        description: t.titulo,
        ...conDeshacer(() => cambiarFechaTarea(t.id, anterior), "La tarea regresó a su fecha."),
      });
    });
  }

  // La nueva fecha se cuenta desde hoy (o desde su fecha, si aún no llega).
  const base = iso(t.vence) > hoy ? iso(t.vence) : hoy;
  const opcionesPosponer = [
    ...(iso(t.vence) < hoy ? [{ label: "Para hoy", fecha: hoy }] : []),
    { label: "Mañana", fecha: sumarDiasIso(hoy, 1) },
    { label: "En 3 días", fecha: sumarDiasIso(base, 3) },
    { label: "En una semana", fecha: sumarDiasIso(base, 7) },
  ].filter((o) => o.fecha !== iso(t.vence));

  const marcada = miParte ? miParte.hecha : completada;
  const tengoCasilla = miParte !== undefined || sinEncargados;

  return (
    <li className={cn("group flex items-start gap-3 px-5 py-3", pendiente && "opacity-60")}>
      {tengoCasilla ? (
        // Los dos íconos están siempre montados y se cruzan (opacidad y escala, 150 ms): marcar y
        // desmarcar seguido se interrumpe sin saltos.
        <button
          type="button"
          onClick={alternar}
          disabled={pendiente || marcando}
          aria-pressed={marcada}
          aria-label={
            marcada
              ? `Reabrir ${miParte && partes.length > 1 ? "mi parte de" : ""}: ${t.titulo}`
              : `Marcar ${miParte && partes.length > 1 ? "mi parte de" : "como hecha"}: ${t.titulo}`
          }
          className="relative mt-0.5 size-5 shrink-0 rounded-full text-muted-foreground transition-[color,scale] duration-150 ease-out hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-90"
        >
          <Circle
            aria-hidden
            className={cn(
              "absolute inset-0 size-5 transition-[opacity,scale] duration-150 ease-out",
              marcada && "scale-80 opacity-0 motion-reduce:scale-100"
            )}
          />
          <CheckCircle2
            aria-hidden
            className={cn(
              "absolute inset-0 size-5 text-success transition-[opacity,scale] duration-150 ease-out",
              !marcada && "scale-80 opacity-0 motion-reduce:scale-100"
            )}
          />
        </button>
      ) : (
        // Quien no es encargado ve el avance de la tarea en un anillo.
        <AnilloAvance porcentaje={avance.porcentaje} completada={completada} />
      )}
      <div className="min-w-0 flex-1 space-y-1 wrap-anywhere">
        {/* El tachado aparece y se va con un fundido, no de golpe. */}
        <p
          className={cn(
            "text-sm font-medium line-through decoration-transparent transition-[color,text-decoration-color] duration-200 ease-out",
            completada && "text-muted-foreground decoration-muted-foreground"
          )}
        >
          {t.titulo}
        </p>
        {t.descripcion && <p className="text-xs whitespace-pre-line text-muted-foreground">{t.descripcion}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "font-medium tabular-nums",
              grupo === "vencida" && "text-destructive",
              grupo === "hoy" && "text-warning"
            )}
          >
            {grupo === "hoy" ? "Hoy" : formatFecha(t.vence)}
            {grupo === "vencida" && " · vencida"}
          </span>
          {mostrarResponsable && partes.length <= 1 && (
            <span className="flex items-center gap-1">
              <User className="size-3" /> {partes[0]?.nombre ?? "Sin asignar"}
            </span>
          )}
          {contexto !== "cliente" && contexto !== "poliza" && t.cliente &&
            (enlaces ? (
              <Link href={`/clientes/${t.cliente.id}`} className="hover:text-primary hover:underline">
                {t.cliente.nombre}
              </Link>
            ) : (
              <span>{t.cliente.nombre}</span>
            ))}
          {contexto !== "poliza" && t.poliza &&
            (enlaces ? (
              <Link href={`/polizas/${t.poliza.id}`} className="flex items-center gap-1 font-mono hover:text-primary hover:underline">
                <FileText className="size-3" /> {t.poliza.numeroImpreso}
              </Link>
            ) : (
              <span className="flex items-center gap-1 font-mono">
                <FileText className="size-3" /> {t.poliza.numeroImpreso}
              </span>
            ))}
        </p>
        {partes.length > 1 && (
          <AvanceEncargados
            partes={partes}
            usuarioId={usuarioId}
            hechas={avance.hechas}
            porcentaje={avance.porcentaje}
            onAlternar={coordina && !marcando ? alternarParte : undefined}
          />
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      {!completada && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground opacity-100 hover:text-primary md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
              disabled={pendiente}
              aria-label={`Cambiar la fecha de: ${t.titulo}`}
            >
              <CalendarClock className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Posponer</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {opcionesPosponer.map((o) => (
              <DropdownMenuItem key={o.label} onSelect={() => posponer(o.fecha)}>
                {o.label}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatFecha(`${o.fecha}T00:00:00Z`)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {puedeBorrar && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          onClick={borrar}
          disabled={pendiente}
          aria-label={`Borrar tarea: ${t.titulo}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

/** Anillo con el porcentaje de avance (para quien no es encargado de la tarea). */
function AnilloAvance({ porcentaje, completada }: { porcentaje: number; completada: boolean }) {
  const r = 8;
  const largo = 2 * Math.PI * r;
  return (
    <span
      role="img"
      aria-label={completada ? "Tarea completada" : `Avance: ${porcentaje}%`}
      title={completada ? "Completada" : `Avance: ${porcentaje}%`}
      className="mt-0.5 shrink-0"
    >
      {completada ? (
        <CheckCircle2 className="size-5 text-success" />
      ) : (
        <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
          <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" className="stroke-muted" />
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={largo}
            strokeDashoffset={largo * (1 - porcentaje / 100)}
            className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * Avance de una tarea con varios encargados: barra, "2 de 3 · 67 %" y cada encargado con su
 * palomita. Quien coordina puede marcar la parte de cualquiera tocando su nombre.
 */
function AvanceEncargados({
  partes,
  usuarioId,
  hechas,
  porcentaje,
  onAlternar,
}: {
  partes: { id: string; nombre: string; hecha: boolean }[];
  usuarioId: string;
  hechas: number;
  porcentaje: number;
  onAlternar?: (p: { id: string; nombre: string; hecha: boolean }) => void;
}) {
  return (
    <div className="space-y-1.5 pt-0.5">
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Avance de la tarea"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcentaje}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-300 ease-out", porcentaje === 100 ? "bg-success" : "bg-primary")}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
          <Users className="size-3" />
          {hechas} de {partes.length} · {porcentaje}%
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Encargados">
        {partes.map((p) => {
          const contenido = (
            <>
              <span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center rounded-full text-[9px] font-semibold",
                  p.hecha ? "bg-success text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {p.hecha ? <Check className="size-2.5" strokeWidth={3} /> : iniciales(p.nombre)}
              </span>
              <span className="max-w-36 truncate">{p.id === usuarioId ? "Yo" : p.nombre}</span>
            </>
          );
          const clase = cn(
            "inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-[11px]",
            p.hecha ? "border-success/40 bg-success/10 text-foreground" : "bg-background text-muted-foreground"
          );
          return (
            <li key={p.id}>
              {onAlternar ? (
                <button
                  type="button"
                  onClick={() => onAlternar(p)}
                  aria-pressed={p.hecha}
                  title={p.hecha ? `Marcar pendiente la parte de ${p.nombre}` : `Marcar lista la parte de ${p.nombre}`}
                  className={cn(clase, "transition-[background-color,border-color,scale] duration-150 ease-out hover:border-primary/50 active:scale-95")}
                >
                  {contenido}
                </button>
              ) : (
                <span className={clase} title={`${p.nombre}: ${p.hecha ? "listo" : "pendiente"}`}>
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
