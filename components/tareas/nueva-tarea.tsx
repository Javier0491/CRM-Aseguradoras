"use client";

import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { crearTarea } from "@/lib/tareas/actions";
import {
  MAX_DESCRIPCION_TAREA,
  MAX_RESPONSABLES_TAREA,
  MAX_TITULO_TAREA,
  sumarDiasIso,
  type ErroresTarea,
} from "@/lib/tareas/reglas";
import { rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";
import { cn } from "@/lib/utils";

/**
 * Botón y diálogo para crear una tarea. Con `clienteId` o `polizaId` queda ligada a ese registro.
 * `equipo` habilita elegir a sus encargados (uno o varios; cada uno marca su parte); sin él, la
 * tarea es de quien la crea.
 */
export function NuevaTarea({
  hoy,
  clienteId,
  polizaId,
  equipo,
  usuarioId,
  sugerencia,
  etiqueta = "Nueva tarea",
  variante = "outline",
  className,
}: {
  hoy: string;
  clienteId?: string;
  polizaId?: string;
  equipo?: { id: string; nombre: string; rol: string }[];
  usuarioId: string;
  /** Título propuesto (p. ej. "Llamar a Juan por su renovación"). */
  sugerencia?: string;
  etiqueta?: string;
  variante?: "default" | "outline" | "ghost";
  className?: string;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [titulo, setTitulo] = React.useState(sugerencia ?? "");
  const [descripcion, setDescripcion] = React.useState("");
  const [vence, setVence] = React.useState(hoy);
  const propios = equipo?.some((e) => e.id === usuarioId) ? [usuarioId] : [];
  const [responsables, setResponsables] = React.useState<string[]>(propios);
  const [errores, setErrores] = React.useState<ErroresTarea>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function abrir() {
    setTitulo(sugerencia ?? "");
    setDescripcion("");
    setVence(hoy);
    setResponsables(propios);
    setErrores({});
    setError(null);
    setAbierto(true);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await crearTarea({
        titulo,
        descripcion,
        vence,
        ...(equipo && { responsables }),
        ...(polizaId ? { polizaId } : clienteId ? { clienteId } : {}),
      });
      if (r.ok) {
        setAbierto(false);
        const otros = responsables.filter((id) => id !== usuarioId).length;
        toast.success("Tarea creada", {
          description:
            equipo && responsables.length > 1
              ? `${titulo.trim()} · ${responsables.length} encargados`
              : otros === 1
                ? `${titulo.trim()} · para ${equipo?.find((e) => responsables.includes(e.id))?.nombre ?? "otra persona"}`
                : titulo.trim(),
        });
      } else {
        setErrores(r.errores ?? {});
        setError(r.error ?? null);
      }
    });
  }

  const atajos = [
    { label: "Hoy", fecha: hoy },
    { label: "Mañana", fecha: sumarDiasIso(hoy, 1) },
    { label: "En 7 días", fecha: sumarDiasIso(hoy, 7) },
  ];

  return (
    <>
      <Button type="button" variant={variante} size="sm" onClick={abrir} className={className}>
        <Plus /> {etiqueta}
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={guardar} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Nueva tarea</DialogTitle>
              <DialogDescription>Un pendiente con fecha; aparece en «Mis pendientes» de su responsable.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="tarea-titulo">¿Qué hay que hacer?</Label>
              <Input
                id="tarea-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={MAX_TITULO_TAREA}
                placeholder="Ej. Llamar al cliente por el pago"
                autoFocus
                aria-invalid={Boolean(errores.titulo)}
              />
              {errores.titulo && <p className="text-xs text-destructive">{errores.titulo}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tarea-vence">Fecha</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="tarea-vence"
                  type="date"
                  value={vence}
                  onChange={(e) => setVence(e.target.value)}
                  className="w-auto"
                  aria-invalid={Boolean(errores.vence)}
                />
                {atajos.map((a) => (
                  <Button
                    key={a.label}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn("h-8", vence === a.fecha && "bg-primary/10 text-primary")}
                    onClick={() => setVence(a.fecha)}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
              {errores.vence && <p className="text-xs text-destructive">{errores.vence}</p>}
            </div>
            {equipo && (
              <SelectorEncargados
                equipo={equipo}
                usuarioId={usuarioId}
                seleccion={responsables}
                onCambiar={setResponsables}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="tarea-descripcion">Notas (opcional)</Label>
              <Textarea
                id="tarea-descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={MAX_DESCRIPCION_TAREA}
                rows={3}
                aria-invalid={Boolean(errores.descripcion)}
              />
              {errores.descripcion && <p className="text-xs text-destructive">{errores.descripcion}</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pendiente}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pendiente}>
                {pendiente ? <Loader2 className="animate-spin" /> : <Plus />} Crear tarea
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Encargados de la tarea: se elige uno o varios tocando su nombre (cada uno marcará su parte).
 * Sin ninguno, la tarea queda sin asignar y la marca cualquiera.
 */
function SelectorEncargados({
  equipo,
  usuarioId,
  seleccion,
  onCambiar,
}: {
  equipo: { id: string; nombre: string; rol: string }[];
  usuarioId: string;
  seleccion: string[];
  onCambiar: (ids: string[]) => void;
}) {
  const alternar = (id: string) =>
    onCambiar(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id].slice(0, MAX_RESPONSABLES_TAREA));
  const todos = seleccion.length === equipo.length;
  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm leading-none font-medium">Encargados</legend>
        <span className="text-xs text-muted-foreground">
          {seleccion.length === 0
            ? "Sin asignar"
            : seleccion.length === 1
              ? "1 encargado"
              : `${seleccion.length} encargados · cada uno marca su parte`}
        </span>
      </div>
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-background/60 p-2">
        {equipo.map((e) => {
          const elegido = seleccion.includes(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => alternar(e.id)}
              aria-pressed={elegido}
              title={rolLabels[e.rol as RolUsuario] ?? e.rol}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-95",
                elegido
                  ? "border-primary bg-primary/15 font-medium text-foreground"
                  : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              <Check className={cn("size-3 transition-opacity duration-150", elegido ? "opacity-100" : "opacity-0")} aria-hidden />
              {e.nombre}
              {e.id === usuarioId && " (yo)"}
            </button>
          );
        })}
      </div>
      {equipo.length > 1 && (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onCambiar(todos ? [] : equipo.slice(0, MAX_RESPONSABLES_TAREA).map((e) => e.id))}
          >
            {todos ? "Quitar a todos" : "Todo el equipo"}
          </button>
        </div>
      )}
    </fieldset>
  );
}
