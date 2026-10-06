"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { crearTarea } from "@/lib/tareas/actions";
import { MAX_DESCRIPCION_TAREA, MAX_TITULO_TAREA, sumarDiasIso, type ErroresTarea } from "@/lib/tareas/reglas";
import { cn } from "@/lib/utils";

const SIN_RESPONSABLE = "__sin_asignar__";

/**
 * Botón y diálogo para crear una tarea. Con `clienteId` o `polizaId` queda ligada a ese registro.
 * `ejecutivos` habilita elegir al responsable (sin él, la tarea es de quien la crea).
 */
export function NuevaTarea({
  hoy,
  clienteId,
  polizaId,
  ejecutivos,
  usuarioId,
  sugerencia,
  etiqueta = "Nueva tarea",
  variante = "outline",
  className,
}: {
  hoy: string;
  clienteId?: string;
  polizaId?: string;
  ejecutivos?: { id: string; nombre: string }[];
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
  const propio = ejecutivos?.some((e) => e.id === usuarioId) ? usuarioId : "";
  const [responsable, setResponsable] = React.useState(propio);
  const [errores, setErrores] = React.useState<ErroresTarea>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function abrir() {
    setTitulo(sugerencia ?? "");
    setDescripcion("");
    setVence(hoy);
    setResponsable(propio);
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
        ...(ejecutivos && { ejecutivoId: responsable }),
        ...(polizaId ? { polizaId } : clienteId ? { clienteId } : {}),
      });
      if (r.ok) setAbierto(false);
      else {
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
            {ejecutivos && (
              <div className="space-y-2">
                <Label htmlFor="tarea-responsable">Responsable</Label>
                <Select value={responsable || SIN_RESPONSABLE} onValueChange={(v) => setResponsable(v === SIN_RESPONSABLE ? "" : v)}>
                  <SelectTrigger id="tarea-responsable" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_RESPONSABLE}>Sin asignar</SelectItem>
                    {ejecutivos.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nombre}
                        {e.id === usuarioId ? " (yo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
