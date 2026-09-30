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

/**
 * Búsqueda y filtro por ramo del listado de pólizas. El estado vive en la URL
 * (?q=…&ramo=…&contacto=falta), así el filtrado ocurre en la base de datos y el enlace se puede compartir.
 */
export function FiltrosPolizas({
  q: qInicial,
  ramo: ramoInicial,
  ramos,
  faltaContacto,
}: {
  q: string;
  /** Valor del enum de BD o "" para todos. */
  ramo: string;
  ramos: Opcion[];
  /** Filtro "Falta contacto" (lo activa el aviso del listado); se conserva al buscar. */
  faltaContacto: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(qInicial);
  const [ramo, setRamo] = React.useState(ramoInicial || TODOS);
  const [pendiente, startTransition] = React.useTransition();
  const temporizador = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    },
    []
  );

  function navegar(siguiente: { q: string; ramo: string; contacto?: boolean }) {
    const params = new URLSearchParams();
    if (siguiente.q.trim()) params.set("q", siguiente.q.trim());
    if (siguiente.ramo !== TODOS) params.set("ramo", siguiente.ramo);
    if (siguiente.contacto ?? faltaContacto) params.set("contacto", "falta");
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function cambiarTexto(valor: string) {
    setQ(valor);
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => navegar({ q: valor, ramo }), ESPERA_MS);
  }

  function cambiarRamo(valor: string) {
    setRamo(valor);
    navegar({ q, ramo: valor });
  }

  function limpiar() {
    if (temporizador.current) window.clearTimeout(temporizador.current);
    setQ("");
    setRamo(TODOS);
    navegar({ q: "", ramo: TODOS, contacto: false });
  }

  const activos = q.trim() !== "" || ramo !== TODOS || faltaContacto;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-sm">
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
      <Select value={ramo} onValueChange={cambiarRamo}>
        <SelectTrigger className="w-full bg-card sm:w-52" aria-label="Filtrar por ramo">
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
      {activos && (
        <Button type="button" variant="ghost" size="sm" onClick={limpiar} className="text-muted-foreground">
          <X /> Limpiar filtros
        </Button>
      )}
    </div>
  );
}
