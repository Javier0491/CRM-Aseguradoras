"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Receipt, Search, UserRound, type LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { ResultadoBusqueda } from "@/lib/busqueda/queries";
import { cn } from "@/lib/utils";

const ESPERA_MS = 200;

const GRUPOS: { tipo: ResultadoBusqueda["tipo"]; titulo: string; icono: LucideIcon }[] = [
  { tipo: "cliente", titulo: "Clientes", icono: UserRound },
  { tipo: "poliza", titulo: "Pólizas", icono: FileText },
  { tipo: "recibo", titulo: "Recibos", icono: Receipt },
];

/** Buscador del encabezado: clientes, pólizas y folios de recibo, navegable con teclado (Ctrl+K). */
export function BusquedaGlobal() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [q, setQ] = React.useState("");
  const [resultados, setResultados] = React.useState<ResultadoBusqueda[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [abierto, setAbierto] = React.useState(false);
  const [activo, setActivo] = React.useState(0);
  const listaId = React.useId();
  // Con menos de dos letras no se muestran resultados de una búsqueda anterior.
  const visibles = q.trim().length >= 2 ? resultados : [];

  // Ctrl+K / ⌘K enfoca el buscador desde cualquier pantalla.
  React.useEffect(() => {
    function atajo(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, []);

  const temporizador = React.useRef<number | null>(null);
  const control = React.useRef<AbortController | null>(null);
  React.useEffect(
    () => () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
      control.current?.abort();
    },
    []
  );

  /** Busca al escribir, con una pausa corta y cancelando la búsqueda anterior. */
  function buscar(valor: string) {
    setQ(valor);
    setAbierto(true);
    if (temporizador.current) window.clearTimeout(temporizador.current);
    control.current?.abort();
    const texto = valor.trim();
    if (texto.length < 2) {
      setCargando(false);
      return;
    }
    setCargando(true);
    temporizador.current = window.setTimeout(async () => {
      const actual = new AbortController();
      control.current = actual;
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(texto)}`, { signal: actual.signal });
        const datos = (await res.json()) as { resultados: ResultadoBusqueda[] };
        setResultados(datos.resultados ?? []);
        setActivo(0);
        setCargando(false);
      } catch {
        // Cancelada por una búsqueda más reciente, o sin conexión.
        if (!actual.signal.aborted) setCargando(false);
      }
    }, ESPERA_MS);
  }

  function ir(r: ResultadoBusqueda) {
    setAbierto(false);
    setQ("");
    setResultados([]);
    inputRef.current?.blur();
    router.push(r.href);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setAbierto(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown" && visibles.length) {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => (i + 1) % visibles.length);
    } else if (e.key === "ArrowUp" && visibles.length) {
      e.preventDefault();
      setActivo((i) => (i - 1 + visibles.length) % visibles.length);
    } else if (e.key === "Enter" && visibles[activo]) {
      e.preventDefault();
      ir(visibles[activo]);
    }
  }

  const mostrar = abierto && q.trim().length >= 2;

  return (
    <div className="relative hidden md:block">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-activedescendant={mostrar && visibles[activo] ? `${listaId}-${activo}` : undefined}
        aria-label="Buscar póliza, cliente o recibo"
        placeholder="Buscar póliza, cliente o folio…"
        value={q}
        onChange={(e) => buscar(e.target.value)}
        onFocus={() => setAbierto(true)}
        // Deja terminar el clic en un resultado antes de cerrar.
        onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
        onKeyDown={teclado}
        className="h-8 w-72 bg-card pr-12 pl-8 text-sm lg:w-80"
      />
      {cargando ? (
        <Loader2 className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground">
          Ctrl K
        </kbd>
      )}

      {mostrar && (
        <div
          id={listaId}
          role="listbox"
          className="absolute top-full right-0 z-50 mt-1.5 max-h-[70vh] w-96 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {!cargando && visibles.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados para «{q.trim()}».</p>
          ) : (
            GRUPOS.map(({ tipo, titulo, icono: Icon }) => {
              const del = visibles.filter((r) => r.tipo === tipo);
              if (del.length === 0) return null;
              return (
                <div key={tipo} role="group" aria-label={titulo}>
                  <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {titulo}
                  </p>
                  {del.map((r) => {
                    const i = visibles.indexOf(r);
                    return (
                      <button
                        key={`${r.tipo}-${r.id}`}
                        id={`${listaId}-${i}`}
                        type="button"
                        role="option"
                        aria-selected={i === activo}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActivo(i)}
                        onClick={() => ir(r)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left",
                          i === activo && "bg-accent"
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{r.titulo}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.detalle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
