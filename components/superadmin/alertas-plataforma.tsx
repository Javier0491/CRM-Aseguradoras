import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";

import type { AlertaPlataforma } from "@/lib/plataforma/alertas";
import { cn } from "@/lib/utils";

/** Avisos de la plataforma para el SUPERADMIN (migraciones y tarea diaria), con liga al diagnóstico. */
export function AlertasPlataforma({ alertas }: { alertas: AlertaPlataforma[] }) {
  if (alertas.length === 0) return null;
  return (
    <section aria-label="Alertas de la plataforma" className="space-y-2">
      {alertas.map((a) => (
        <div
          key={a.clave}
          role="alert"
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3",
            a.grave ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"
          )}
        >
          {a.grave ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className={cn("font-medium", a.grave ? "text-destructive" : "text-warning")}>{a.titulo}</p>
            <p className="break-words text-muted-foreground">{a.detalle}</p>
          </div>
          <Link href="/superadmin/diagnostico" className="shrink-0 text-xs font-medium text-primary hover:underline">
            Diagnóstico
          </Link>
        </div>
      ))}
    </section>
  );
}
