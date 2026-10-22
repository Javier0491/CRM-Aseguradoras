"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Download, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Omitido, Repetida, UnidadPoliza } from "@/lib/carga-masiva/agrupar";
import { formatBytes } from "@/lib/archivos/config";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

const POR_PAGINA = 100;

const carpetaDe = (ruta: string) => ruta.slice(0, Math.max(ruta.lastIndexOf("/"), 0));
const nombreDe = (ruta: string) => ruta.split("/").at(-1) ?? ruta;
/** PDFs sueltos agrupados: su clave termina en "/#número"; se muestra su carpeta. */
const ruta = (clave: string) => (nombreDe(clave).startsWith("#") ? carpetaDe(clave) : clave);
const archivos = (n: number) => `${formatNumero(n)} ${n === 1 ? "archivo" : "archivos"}`;

/** Búsqueda por palabras en cualquier orden, sin acentos ni mayúsculas. */
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const coincide = (texto: string, busqueda: string) => {
  const t = normalizar(texto);
  return normalizar(busqueda).split(/\s+/).filter(Boolean).every((p) => t.includes(p));
};

function descargarCsv(nombre: string, repetidas: Repetida[], omitidos: Omitido[], unidades: Map<string, UnidadPoliza>) {
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const filas = [
    ["Qué es", "Motivo", "Ruta", "Archivos", "Se lee en su lugar", "Archivos del que se lee"],
    ...repetidas.map((r) => [
      "Copia repetida",
      r.motivo,
      ruta(r.unidad.clave),
      r.unidad.archivos.length,
      ruta(r.original),
      unidades.get(r.original)?.archivos.length ?? "",
    ]),
    ...omitidos.map((o) => ["No es póliza", o.motivo, o.ruta, "", "", ""]),
  ];
  // BOM para que Excel respete los acentos.
  const csv = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre} - lo que no se lee.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Lo que la carga masiva deja fuera, para verificarlo: las copias de una póliza que ya se lee en
 * otra carpeta (con cuál se juntó y por qué) y los archivos que no son pólizas. Una copia que en
 * realidad es otra póliza se puede mandar a leer aparte.
 */
export function NoSeLeen({
  nombre,
  repetidas,
  omitidos,
  unidades,
  tamanoDe,
  ocupado,
  onLeerAparte,
}: {
  nombre: string;
  repetidas: Repetida[];
  omitidos: Omitido[];
  unidades: UnidadPoliza[];
  /** Tamaño en bytes de un archivo de lo elegido, para comparar una copia con su original. */
  tamanoDe: (ruta: string) => number;
  ocupado: boolean;
  onLeerAparte: (clave: string) => void;
}) {
  const [vista, setVista] = React.useState<"repetidas" | "omitidos">(repetidas.length ? "repetidas" : "omitidos");
  const [busqueda, setBusqueda] = React.useState("");
  const [pagina, setPagina] = React.useState(1);
  const porClave = React.useMemo(() => new Map(unidades.map((u) => [u.clave, u])), [unidades]);

  const repetidasVisibles = repetidas.filter((r) => coincide(`${r.unidad.clave} ${r.original}`, busqueda));
  const omitidosVisibles = omitidos.filter((o) => coincide(o.ruta, busqueda));
  const total = vista === "repetidas" ? repetidasVisibles.length : omitidosVisibles.length;
  const porMotivo = Object.entries(
    repetidas.reduce<Record<string, number>>((acc, r) => {
      const motivo = r.motivo.startsWith("Misma vigencia") ? "Misma vigencia y número" : r.motivo;
      acc[motivo] = (acc[motivo] ?? 0) + 1;
      return acc;
    }, {})
  );

  return (
    <Card id="lo-que-no-se-lee" className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="text-base">Lo que no se lee</CardTitle>
        <CardDescription>
          Para que verifiques lo que la carga deja fuera. Una copia solo se salta si es la misma póliza que otra que sí se
          lee: misma vigencia y número en el nombre de la carpeta, o el mismo nombre con exactamente los mismos archivos. Si
          alguna es otra póliza, usa «Leerla aparte»; si resulta ser la misma, al leerla aparecerá en «Ya estaban en el CRM»
          y no se duplica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={vista}
            onValueChange={(v) => {
              setVista(v as typeof vista);
              setPagina(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="repetidas">Copias repetidas · {formatNumero(repetidas.length)}</TabsTrigger>
              <TabsTrigger value="omitidos">No son pólizas · {formatNumero(omitidos.length)}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => descargarCsv(nombre, repetidas, omitidos, porClave)}
          >
            <Download /> Descargar lista (Excel)
          </Button>
        </div>

        {vista === "repetidas" && porMotivo.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {porMotivo.map(([motivo, n]) => `${motivo}: ${formatNumero(n)}`).join(" · ")}
          </p>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por nombre, número o carpeta"
            aria-label="Buscar en lo que no se lee"
            className="pl-8"
          />
        </div>

        <ul className="divide-y rounded-lg border">
          {vista === "repetidas"
            ? repetidasVisibles
                .slice(0, pagina * POR_PAGINA)
                .map((r) => (
                  <FilaRepetida
                    key={r.unidad.clave}
                    repetida={r}
                    original={porClave.get(r.original)}
                    tamanoDe={tamanoDe}
                    ocupado={ocupado}
                    onLeerAparte={() => onLeerAparte(r.unidad.clave)}
                  />
                ))
            : omitidosVisibles.slice(0, pagina * POR_PAGINA).map((o) => (
                <li key={o.ruta} className="space-y-0.5 px-3 py-2.5">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{nombreDe(o.ruta)}</p>
                  <RutaCopiable ruta={o.ruta} />
                  <p className="text-[11px] text-muted-foreground">{o.motivo}</p>
                </li>
              ))}
          {total === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              {busqueda ? "Nada coincide con la búsqueda." : "Nada en este apartado."}
            </li>
          )}
        </ul>
        {total > pagina * POR_PAGINA && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setPagina((p) => p + 1)}>
            Ver {formatNumero(Math.min(POR_PAGINA, total - pagina * POR_PAGINA))} más
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Ruta tal como se ve en el Explorador de Windows, con un botón para copiarla. */
function RutaCopiable({ ruta: completa }: { ruta: string }) {
  const [copiada, setCopiada] = React.useState(false);
  const windows = completa.replace(/\//g, "\\");
  return (
    <p className="flex items-start gap-1 text-xs text-muted-foreground">
      <span className="min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]">{windows}</span>
      <button
        type="button"
        className="-my-0.5 shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"
        aria-label="Copiar la ruta"
        title="Copiar la ruta"
        onClick={() => {
          void navigator.clipboard.writeText(windows).then(
            () => {
              setCopiada(true);
              setTimeout(() => setCopiada(false), 1500);
            },
            () => toast.error("No se pudo copiar la ruta.")
          );
        }}
      >
        {copiada ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </p>
  );
}

/** Archivos de una póliza con su ruta desde ella y su tamaño. */
function ListaArchivos({ unidad, tamanoDe }: { unidad: UnidadPoliza; tamanoDe: (ruta: string) => number }) {
  const base = unidad.tipo === "pdf" ? `${carpetaDe(unidad.clave)}/` : `${unidad.clave}/`;
  const filas = unidad.archivos
    .map((r) => ({ ruta: r, nombre: r.startsWith(base) ? r.slice(base.length) : nombreDe(r), tamano: tamanoDe(r) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return (
    <ul className="space-y-0.5">
      {filas.map((f) => (
        <li key={f.ruta} className="flex justify-between gap-3 text-[11px]">
          <span className="min-w-0 [overflow-wrap:anywhere]">{f.nombre}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">{formatBytes(f.tamano)}</span>
        </li>
      ))}
    </ul>
  );
}

function FilaRepetida({
  repetida: r,
  original,
  tamanoDe,
  ocupado,
  onLeerAparte,
}: {
  repetida: Repetida;
  original: UnidadPoliza | undefined;
  tamanoDe: (ruta: string) => number;
  ocupado: boolean;
  onLeerAparte: () => void;
}) {
  const [abierta, setAbierta] = React.useState(false);
  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">
            {r.unidad.nombre}{" "}
            <span className="text-xs font-normal text-muted-foreground">· {archivos(r.unidad.archivos.length)}</span>
          </p>
          <RutaCopiable ruta={ruta(r.unidad.clave)} />
          <p className="pt-0.5 text-xs">
            Se lee en su lugar
            {original && <span className="text-muted-foreground"> · {archivos(original.archivos.length)}</span>}
          </p>
          <RutaCopiable ruta={ruta(r.original)} />
          <p className="text-[11px] text-muted-foreground">{r.motivo}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={ocupado} onClick={onLeerAparte}>
            Leerla aparte
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            aria-expanded={abierta}
            onClick={() => setAbierta((a) => !a)}
          >
            Ver archivos <ChevronDown className={cn("transition-transform duration-200", abierta && "rotate-180")} />
          </Button>
        </div>
      </div>
      {abierta && (
        <div className="grid gap-3 rounded-md bg-muted/50 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Esta copia</p>
            <ListaArchivos unidad={r.unidad} tamanoDe={tamanoDe} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">La que se lee</p>
            {original ? (
              <ListaArchivos unidad={original} tamanoDe={tamanoDe} />
            ) : (
              <p className="text-[11px] text-muted-foreground">No está en la lista.</p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
