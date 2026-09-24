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

/** Filtro global del dashboard: vive en la URL (?periodo=…) y recalcula todo en el servidor. */
export function PeriodoSelector({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = React.useTransition();

  function cambiar(valor: string) {
    const destino = valor === PERIODO_PREDETERMINADO ? pathname : `${pathname}?periodo=${valor}`;
    startTransition(() => router.replace(destino, { scroll: false }));
  }

  return (
    <Select value={periodo} onValueChange={cambiar}>
      <SelectTrigger className="w-48 bg-card" aria-label="Periodo del dashboard">
        {pendiente ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <CalendarRange className="size-4 text-muted-foreground" />
        )}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {PERIODOS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
