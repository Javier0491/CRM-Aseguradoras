"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIODO_PREDETERMINADO, PERIODOS, type Periodo } from "@/lib/dashboard/periodos";

type Opcion = { readonly value: string; readonly label: string };

/**
 * Filtro global de periodo: vive en la URL (?periodo=…) y recalcula todo en el servidor.
 * Por omisión usa los periodos del dashboard; Reportes pasa los suyos.
 */
export function PeriodoSelector<P extends string = Periodo>({
  periodo,
  opciones = PERIODOS,
  predeterminado = PERIODO_PREDETERMINADO,
  etiqueta = "Periodo del dashboard",
}: {
  periodo: P;
  opciones?: readonly Opcion[];
  predeterminado?: string;
  etiqueta?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = React.useTransition();

  function cambiar(valor: string) {
    const destino = valor === predeterminado ? pathname : `${pathname}?periodo=${valor}`;
    startTransition(() => router.replace(destino, { scroll: false }));
  }

  return (
    <Select value={periodo} onValueChange={cambiar}>
      <SelectTrigger className="w-48 bg-card" aria-label={etiqueta}>
        {pendiente ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <CalendarRange className="size-4 text-muted-foreground" />
        )}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {opciones.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
