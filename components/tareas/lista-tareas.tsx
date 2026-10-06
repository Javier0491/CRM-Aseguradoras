"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Circle, FileText, Loader2, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFecha } from "@/lib/format";
import { cambiarEstadoTarea, cambiarFechaTarea, eliminarTarea } from "@/lib/tareas/actions";
import { grupoTarea, sumarDiasIso } from "@/lib/tareas/reglas";
import { cn } from "@/lib/utils";

export type TareaVista = {
  id: string;
  titulo: string;
  descripcion: string | null;
  vence: Date;
  completadaAt: Date | null;
  responsable: { id: string; nombre: string } | null;
  cliente: { id: string; nombre: string } | null;
  poliza: { id: string; numeroImpreso: string } | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lista de tareas con casilla para completarlas. `contexto` oculta el enlace al registro en el que
 * ya se está (p. ej. dentro del expediente del cliente).
 */
export function ListaTareas({
  tareas,
  hoy,
  contexto,
  mostrarResponsable = true,
  vacio = "Sin tareas pendientes.",
}: {
  tareas: TareaVista[];
  hoy: string;
  contexto?: "cliente" | "poliza";
  mostrarResponsable?: boolean;
  vacio?: string;
}) {
  if (tareas.length === 0) return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="divide-y">
      {tareas.map((t) => (
        <FilaTarea key={t.id} tarea={t} hoy={hoy} contexto={contexto} mostrarResponsable={mostrarResponsable} />
      ))}
    </ul>
  );
}

function FilaTarea({
  tarea: t,
  hoy,
  contexto,
  mostrarResponsable,
}: {
  tarea: TareaVista;
  hoy: string;
  contexto?: "cliente" | "poliza";
  mostrarResponsable: boolean;
}) {
  const [pendiente, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const completada = t.completadaAt !== null;
  const grupo = grupoTarea({ vence: iso(t.vence), completada }, hoy);

  function alternar() {
    setError(null);
    startTransition(async () => {
      const r = await cambiarEstadoTarea(t.id, !completada);
      if (!r.ok) setError(r.error ?? "No se pudo actualizar.");
    });
  }

  function borrar() {
    setError(null);
    startTransition(async () => {
      const r = await eliminarTarea(t.id);
      if (!r.ok) setError(r.error ?? "No se pudo borrar.");
    });
  }

  function posponer(fecha: string) {
    setError(null);
    startTransition(async () => {
      const r = await cambiarFechaTarea(t.id, fecha);
      if (!r.ok) setError(r.error ?? "No se pudo cambiar la fecha.");
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

  return (
    <li className={cn("group flex items-start gap-3 px-5 py-3", pendiente && "opacity-60")}>
      <button
        type="button"
        onClick={alternar}
        disabled={pendiente}
        aria-label={completada ? `Reabrir: ${t.titulo}` : `Marcar como hecha: ${t.titulo}`}
        className="mt-0.5 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {pendiente ? (
          <Loader2 className="size-5 animate-spin" />
        ) : completada ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("text-sm font-medium", completada && "text-muted-foreground line-through")}>{t.titulo}</p>
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
          {mostrarResponsable && (
            <span className="flex items-center gap-1">
              <User className="size-3" /> {t.responsable?.nombre ?? "Sin asignar"}
            </span>
          )}
          {contexto !== "cliente" && contexto !== "poliza" && t.cliente && (
            <Link href={`/clientes/${t.cliente.id}`} className="hover:text-primary hover:underline">
              {t.cliente.nombre}
            </Link>
          )}
          {contexto !== "poliza" && t.poliza && (
            <Link href={`/polizas/${t.poliza.id}`} className="flex items-center gap-1 font-mono hover:text-primary hover:underline">
              <FileText className="size-3" /> {t.poliza.numeroImpreso}
            </Link>
          )}
        </p>
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
    </li>
  );
}
