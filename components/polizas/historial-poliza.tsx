import { FilePlus2, History, Pencil, Scale, MessageSquareText, Trash2, Undo2, type LucideIcon } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventoHistorial, TipoEventoHistorial } from "@/lib/bitacora/historial-poliza";
import { cn } from "@/lib/utils";

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

const ESTILO: Record<TipoEventoHistorial, { icono: LucideIcon; clase: string }> = {
  captura: { icono: FilePlus2, clase: "border-success/30 bg-success/10 text-success" },
  edicion: { icono: Pencil, clase: "border-border bg-muted text-muted-foreground" },
  conciliacion: { icono: Scale, clase: "border-primary/30 bg-primary/10 text-primary" },
  reversion: { icono: Undo2, clase: "border-destructive/30 bg-destructive/10 text-destructive" },
  aclaracion: { icono: MessageSquareText, clase: "border-warning/30 bg-warning/10 text-warning" },
  eliminacion: { icono: Trash2, clase: "border-destructive/30 bg-destructive/10 text-destructive" },
};

/** Historial de la póliza: quién hizo qué y cuándo, de lo más reciente a lo más antiguo. */
export function HistorialPoliza({ eventos, limite }: { eventos: EventoHistorial[]; limite: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" />
          Historial
        </CardTitle>
        <CardDescription>Captura, ediciones, conciliaciones y aclaraciones de esta póliza.</CardDescription>
      </CardHeader>
      {eventos.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          Sin movimientos registrados. Las pólizas capturadas antes de existir la bitácora no tienen historial previo.
        </p>
      ) : (
        <ol className="px-5 py-4">
          {eventos.map((e, i) => {
            const { icono: Icono, clase } = ESTILO[e.tipo];
            return (
              <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < eventos.length - 1 && (
                  <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-border" />
                )}
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", clase)}>
                  <Icono className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium">{e.titulo}</p>
                    <time dateTime={e.fecha.toISOString()} className="text-xs text-muted-foreground tabular-nums">
                      {fechaHora.format(e.fecha)}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground">{e.usuario ?? "Sistema"}</p>
                  <p className="mt-1 text-sm break-words text-foreground/90">{e.descripcion}</p>
                  {e.cambios && e.cambios.length > 0 && (
                    <dl className="mt-2 grid gap-1 rounded-lg border bg-background/60 p-2.5 text-xs">
                      {e.cambios.map((c) => (
                        <div key={c.campo} className="flex flex-wrap gap-x-2">
                          <dt className="text-muted-foreground">{c.campo}:</dt>
                          <dd>
                            <span className="text-muted-foreground line-through">{c.antes}</span>{" "}
                            → <span className="font-medium">{c.despues}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {eventos.length >= limite && (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Mostrando los {limite} movimientos más recientes.
        </p>
      )}
    </Card>
  );
}
