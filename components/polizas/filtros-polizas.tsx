"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Opcion } from "@/lib/polizas/ramos";

const TODOS = "todos";
const ESPERA_MS = 300;

type Estado = {
  q: string;
  ramo: string;
  ejecutivo: string;
  estatus: string;
  contacto?: boolean;
};

/**
 * Búsqueda y filtros del listado de pólizas (ramo, ejecutivo y estatus). El estado vive en la URL
 * (?q=…&ramo=…&ejecutivo=…&estatus=…&contacto=falta), así el filtrado ocurre en la base de datos
 * y el enlace se puede compartir.
 */
export function FiltrosPolizas({
  q: qInicial,
  ramo: ramoInicial,
  ramos,
  faltaContacto,
  ejecutivo: ejecutivoInicial = "",
  ejecutivos,
  usuarioId,
  estatus: estatusInicial = "",
}: {
  q: string;
  /** Valor del enum de BD o "" para todos. */
  ramo: string;
  ramos: Opcion[];
  /** Filtro "Falta contacto" (lo activa el aviso del listado); se conserva al buscar. */
  faltaContacto: boolean;
  /** Id del ejecutivo, "sin" o "" para todos. */
  ejecutivo?: string;
  /** Sin la lista no se muestra el filtro (el ejecutivo que solo ve su cartera). */
  ejecutivos?: { id: string; nombre: string }[];
  usuarioId?: string;
  /** "vigor", "canceladas" o "" para todas. */
  estatus?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(qInicial);
  const [ramo, setRamo] = React.useState(ramoInicial || TODOS);
  const [ejecutivo, setEjecutivo] = React.useState(ejecutivoInicial || TODOS);
  const [estatus, setEstatus] = React.useState(estatusInicial || TODOS);
  const [pendiente, startTransition] = React.useTransition();
  const temporizador = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    },
    []
  );

  function navegar(siguiente: Estado) {
    const params = new URLSearchParams();
    if (siguiente.q.trim()) params.set("q", siguiente.q.trim());
    if (siguiente.ramo !== TODOS) params.set("ramo", siguiente.ramo);
    if (siguiente.ejecutivo !== TODOS) params.set("ejecutivo", siguiente.ejecutivo);
    if (siguiente.estatus !== TODOS) params.set("estatus", siguiente.estatus);
    if (siguiente.contacto ?? faltaContacto) params.set("contacto", "falta");
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const actual = (): Estado => ({ q, ramo, ejecutivo, estatus });

  function cambiarTexto(valor: string) {
    setQ(valor);
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => navegar({ ...actual(), q: valor }), ESPERA_MS);
  }

  function limpiar() {
    if (temporizador.current) window.clearTimeout(temporizador.current);
    setQ("");
    setRamo(TODOS);
    setEjecutivo(TODOS);
    setEstatus(TODOS);
    navegar({ q: "", ramo: TODOS, ejecutivo: TODOS, estatus: TODOS, contacto: false });
  }

  const activos = q.trim() !== "" || ramo !== TODOS || ejecutivo !== TODOS || estatus !== TODOS || faltaContacto;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="relative flex-1 lg:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => cambiarTexto(e.target.value)}
          placeholder="Buscar por póliza, cliente, RFC o asegurado"
          aria-label="Buscar pólizas"
          className="bg-card pr-9 pl-9"
        />
        {pendiente && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex">
        <Select
          value={ramo}
          onValueChange={(v) => {
            setRamo(v);
            navegar({ ...actual(), ramo: v });
          }}
        >
          <SelectTrigger className="w-full bg-card lg:w-44" aria-label="Filtrar por ramo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los ramos</SelectItem>
            {ramos.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ejecutivos && (
          <Select
            value={ejecutivo}
            onValueChange={(v) => {
              setEjecutivo(v);
              navegar({ ...actual(), ejecutivo: v });
            }}
          >
            <SelectTrigger className="w-full bg-card lg:w-48" aria-label="Filtrar por ejecutivo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los ejecutivos</SelectItem>
              {usuarioId && ejecutivos.some((e) => e.id === usuarioId) && (
                <SelectItem value={usuarioId}>Mi cartera</SelectItem>
              )}
              <SelectItem value="sin">Sin asignar</SelectItem>
              {ejecutivos
                .filter((e) => e.id !== usuarioId)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={estatus}
          onValueChange={(v) => {
            setEstatus(v);
            navegar({ ...actual(), estatus: v });
          }}
        >
          <SelectTrigger className="w-full bg-card lg:w-40" aria-label="Filtrar por estatus">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas</SelectItem>
            <SelectItem value="vigor">En vigor</SelectItem>
            <SelectItem value="canceladas">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {activos && (
        <Button type="button" variant="ghost" size="sm" onClick={limpiar} className="text-muted-foreground lg:ml-auto">
          <X /> Limpiar filtros
        </Button>
      )}
    </div>
  );
}
