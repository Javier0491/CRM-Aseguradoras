"use client";

import * as React from "react";
import { FileText, Folder, Loader2, Search } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EntradaZip } from "@/lib/archivos/zip";
import { formatBytes } from "@/lib/archivos/config";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ZipAbierto = { nombre: string; entradas: EntradaZip[] };

// Las facturas o recibos van primero: es lo que se suele buscar en el ZIP de un portal.
const prioridad = (carpeta: string) => (/fact|recib/i.test(carpeta) ? 0 : 1);

/**
 * Lista los documentos de un ZIP (p. ej. el de facturas del portal) para elegir cuál leer, con un
 * buscador por nombre o número. Las palabras de la búsqueda pueden ir en cualquier orden.
 */
export function SelectorZip({
  zip,
  onElegir,
  onCerrar,
}: {
  zip: ZipAbierto | null;
  /** Extrae y lee la entrada; si falla devuelve el mensaje para mostrarlo aquí. */
  onElegir: (entrada: EntradaZip) => Promise<string | null>;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = React.useState("");
  const [extrayendo, setExtrayendo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [zipPrevio, setZipPrevio] = React.useState(zip);

  // Otro ZIP: se empieza de cero.
  if (zip !== zipPrevio) {
    setZipPrevio(zip);
    setBusqueda("");
    setExtrayendo(null);
    setError(null);
  }

  const grupos = React.useMemo(() => {
    const palabras = busqueda.toLowerCase().split(/\s+/).filter(Boolean);
    const mapa = new Map<string, EntradaZip[]>();
    for (const e of zip?.entradas ?? []) {
      const ruta = e.ruta.toLowerCase();
      if (!palabras.every((p) => ruta.includes(p))) continue;
      mapa.set(e.carpeta, [...(mapa.get(e.carpeta) ?? []), e]);
    }
    return [...mapa].sort(([a], [b]) => prioridad(a) - prioridad(b));
  }, [zip, busqueda]);
  const visibles = grupos.reduce((s, [, lista]) => s + lista.length, 0);

  async function elegir(entrada: EntradaZip) {
    setExtrayendo(entrada.ruta);
    setError(null);
    const fallo = await onElegir(entrada);
    setExtrayendo(null);
    if (fallo) setError(fallo);
  }

  return (
    <Dialog open={zip !== null} onOpenChange={(abierto) => !abierto && !extrayendo && onCerrar()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Elige el documento del ZIP</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {zip?.nombre} · {formatNumero(zip?.entradas.length ?? 0)}{" "}
            {zip?.entradas.length === 1 ? "documento" : "documentos"}. Busca por número de recibo o por nombre.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej. 91177473 o FACT _C"
            aria-label="Buscar en el ZIP"
            className="pl-9"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2" aria-busy={extrayendo !== null}>
          {visibles === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ningún documento coincide con «{busqueda.trim()}».
            </p>
          ) : (
            grupos.map(([carpeta, lista]) => (
              <section key={carpeta} className="mb-3 last:mb-0">
                {carpeta && (
                  <h3 className="sticky top-0 z-[1] flex items-center gap-1.5 bg-background py-1.5 text-xs font-medium text-muted-foreground">
                    <Folder className="size-3.5" />
                    {carpeta}
                    <span className="tabular-nums">· {formatNumero(lista.length)}</span>
                  </h3>
                )}
                <ul className="space-y-0.5">
                  {lista.map((e) => (
                    <li key={e.ruta}>
                      <button
                        type="button"
                        disabled={extrayendo !== null}
                        onClick={() => elegir(e)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none",
                          "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60",
                          extrayendo === e.ruta && "bg-accent opacity-100"
                        )}
                      >
                        {extrayendo === e.ruta ? (
                          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 font-mono text-xs [overflow-wrap:anywhere]">{e.nombre}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {formatBytes(e.tamano)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
