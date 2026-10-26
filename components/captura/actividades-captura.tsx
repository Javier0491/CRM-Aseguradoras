"use client";

import { BellRing, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MAX_ACTIVIDADES_CAPTURA,
  TIPOS_ACTIVIDAD,
  validarActividad,
  type ActividadCaptura,
  type TipoActividad,
} from "@/lib/tareas/actividades";
import { MAX_DESCRIPCION_TAREA } from "@/lib/tareas/reglas";
import { cn } from "@/lib/utils";

/**
 * Recuadro "Actividades de la póliza" de la captura y la renovación: trámites que quedan pendientes
 * al guardar (p. ej. cambio de agente). Se recuerdan a quien captura hasta que los finaliza.
 * `mostrarErrores` marca las incompletas (después de intentar guardar).
 */
export function ActividadesCaptura({
  actividades,
  onChange,
  disabled,
  mostrarErrores,
}: {
  actividades: ActividadCaptura[];
  onChange: (actividades: ActividadCaptura[]) => void;
  disabled?: boolean;
  mostrarErrores: boolean;
}) {
  const cambiar = (i: number, cambio: Partial<ActividadCaptura>) =>
    onChange(actividades.map((a, j) => (j === i ? { ...a, ...cambio } : a)));

  return (
    <section
      className={cn(
        "space-y-3 rounded-lg border p-4",
        actividades.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-dashed bg-background/40"
      )}
      aria-labelledby="actividades-captura-titulo"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="actividades-captura-titulo" className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className={cn("size-4", actividades.length > 0 ? "text-destructive" : "text-primary")} />
          Actividades de la póliza
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-7"
          disabled={disabled || actividades.length >= MAX_ACTIVIDADES_CAPTURA}
          onClick={() => onChange([...actividades, { tipo: "", comentario: "" }])}
        >
          <Plus /> Agregar actividad
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Lo que queda pendiente con esta póliza (p. ej. un cambio de agente). Al guardar se te recordará cada pocos
        minutos hasta que la marques como finalizada.
      </p>
      {actividades.map((a, i) => {
        const error = mostrarErrores ? validarActividad(a) : null;
        return (
          <div key={i} className="space-y-1">
            <div className="grid gap-2 sm:grid-cols-[13rem_minmax(0,1fr)_auto]">
              <Select value={a.tipo} onValueChange={(v) => cambiar(i, { tipo: v as TipoActividad })} disabled={disabled}>
                <SelectTrigger
                  className="w-full"
                  aria-label={`Tipo de la actividad ${i + 1}`}
                  aria-invalid={Boolean(error && !a.tipo)}
                >
                  <SelectValue placeholder="Tipo de actividad" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ACTIVIDAD.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={a.comentario}
                onChange={(e) => cambiar(i, { comentario: e.target.value })}
                maxLength={MAX_DESCRIPCION_TAREA}
                placeholder={a.tipo === "otro" ? "¿Qué hay que hacer?" : "Comentario: qué hay que hacer (opcional)"}
                aria-label={`Comentario de la actividad ${i + 1}`}
                aria-invalid={Boolean(error && a.tipo)}
                disabled={disabled}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Quitar la actividad ${i + 1}`}
                disabled={disabled}
                onClick={() => onChange(actividades.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );
      })}
    </section>
  );
}
