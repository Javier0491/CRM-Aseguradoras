import Link from "next/link";
import { Construction } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_RAMO, RAMOS_CON_FORMULARIO, RAMOS_COTIZADOR, type RamoCotizador } from "@/lib/cotizador/aseguradoras";
import { cn } from "@/lib/utils";

/** El ramo de la URL (?ramo=gmm); Autos si no viene o no existe. */
export function ramoDeParametro(valor: string | string[] | undefined): RamoCotizador {
  const r = (Array.isArray(valor) ? valor[0] : valor)?.toUpperCase();
  return (RAMOS_COTIZADOR as readonly string[]).includes(r ?? "") ? (r as RamoCotizador) : "AUTOS";
}

/** Pestañas para elegir qué se cotiza: Autos, Gastos médicos, Vida y retiro… */
export function SelectorRamo({ actual }: { actual: RamoCotizador }) {
  return (
    <nav aria-label="Ramo" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {RAMOS_COTIZADOR.map((r) => {
        const listo = RAMOS_CON_FORMULARIO.includes(r);
        return (
          <Link
            key={r}
            href={r === "AUTOS" ? "/cotizador" : `/cotizador?ramo=${r.toLowerCase()}`}
            aria-current={r === actual ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              r === actual ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              !listo && r !== actual && "text-muted-foreground"
            )}
          >
            {ETIQUETA_RAMO[r]}
            {!listo && <span className="text-[10px] opacity-80">pronto</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Lo que pedirá el formulario de cada ramo, según el escaneo de portales del 2026-11-18. */
const PENDIENTE: Partial<Record<RamoCotizador, { pedira: string[]; nota?: string }>> = {
  VIDA: {
    pedira: [
      "Fecha de nacimiento, sexo y si fuma",
      "Plan (temporal, ordinario, dotal, retiro o rentas), plazo y suma asegurada",
      "Moneda (pesos, UDIS o dólares) y beneficios adicionales",
    ],
    nota: "MetLife y GNP cotizan Vida individual con programas instalables, no en el portal: este ramo llegará por API.",
  },
};

/** Ramo sin formulario todavía: qué pedirá y qué falta. */
export function RamoPendiente({ ramo }: { ramo: RamoCotizador }) {
  const info = PENDIENTE[ramo];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Construction className="size-4 text-primary" /> {ETIQUETA_RAMO[ramo]}: formulario en construcción
        </CardTitle>
        <CardDescription>
          Aquí se capturarán los datos una sola vez para cotizar en todas las aseguradoras conectadas de este ramo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {info ? (
          <>
            <div>
              <p className="mb-1 font-medium">Lo que pedirá</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {info.pedira.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            {info.nota && <p className="text-muted-foreground">{info.nota}</p>}
          </>
        ) : (
          <p className="text-muted-foreground">Todavía no se escanean los portales de este ramo.</p>
        )}
      </CardContent>
    </Card>
  );
}
