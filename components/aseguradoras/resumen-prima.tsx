"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";

import { IconoRelieve } from "@/components/layout/icono-relieve";
import { TarjetaResumen } from "@/components/layout/tarjeta-resumen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";

export type PrimaAseguradora = {
  id: string;
  nombre: string;
  /** Color ya normalizado (o el gris de respaldo). */
  color: string;
  monograma: string;
  polizasActivas: number;
  primaActiva: number;
};

/**
 * Tarjeta "Prima vigente" de Aseguradoras: al pulsarla abre el resumen de la prima vigente por
 * compañía (cuánto aporta cada una, su parte y su prima promedio). Cada renglón lleva a las pólizas
 * vigentes de esa compañía.
 */
export function ResumenPrima({
  aseguradoras,
  totalPolizas,
  orden,
}: {
  aseguradoras: PrimaAseguradora[];
  totalPolizas: number;
  orden: number;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const total = aseguradoras.reduce((s, a) => s + a.primaActiva, 0);
  const conPrima = aseguradoras.filter((a) => a.primaActiva > 0).sort((a, b) => b.primaActiva - a.primaActiva);

  return (
    <>
      <TarjetaResumen
        titulo="Prima vigente"
        valor={formatMoneda(total)}
        icono={Wallet}
        detalle="Ver resumen por compañía"
        onClick={() => setAbierto(true)}
        orden={orden}
      />
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Prima vigente · {formatMoneda(total)}</DialogTitle>
            <DialogDescription>
              {formatNumero(totalPolizas)} {totalPolizas === 1 ? "póliza vigente" : "pólizas vigentes"} hoy, por compañía.
              Pulsa una para ver sus pólizas.
            </DialogDescription>
          </DialogHeader>
          {conPrima.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay pólizas vigentes con prima.</p>
          ) : (
            <ul className="-mx-2 max-h-[60vh] space-y-1 overflow-y-auto">
              {conPrima.map((a) => {
                const parte = total > 0 ? a.primaActiva / total : 0;
                return (
                  <li key={a.id}>
                    <Link
                      href={`/polizas?aseguradora=${encodeURIComponent(a.id)}&estatus=vigentes`}
                      onClick={() => setAbierto(false)}
                      className="group/fila flex items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <IconoRelieve color={a.color} texto={a.monograma} className="size-9 rounded-lg text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium">{a.nombre}</p>
                          <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoneda(a.primaActiva)}</p>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${parte * 100}%`, background: a.color }} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                          {formatPorcentaje(parte * 100)} de la prima · {formatNumero(a.polizasActivas)}{" "}
                          {a.polizasActivas === 1 ? "póliza" : "pólizas"} · promedio{" "}
                          {formatMoneda(a.polizasActivas > 0 ? a.primaActiva / a.polizasActivas : 0)}
                        </p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/fila:translate-x-0.5 group-hover/fila:text-primary" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href="/polizas?estatus=vigentes" onClick={() => setAbierto(false)}>
              Ver todas las pólizas vigentes
            </Link>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
