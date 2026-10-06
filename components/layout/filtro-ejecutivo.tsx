"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TODOS = "todos";

/** Selector de ejecutivo que guarda la elección en la URL (?ejecutivo=…), conservando lo demás. */
export function FiltroEjecutivo({
  ejecutivos,
  usuarioId,
  valor,
}: {
  ejecutivos: { id: string; nombre: string }[];
  usuarioId: string;
  /** Id, "sin" o "" para todos. */
  valor: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, startTransition] = React.useTransition();

  function cambiar(v: string) {
    const siguiente = new URLSearchParams(params);
    if (v === TODOS) siguiente.delete("ejecutivo");
    else siguiente.set("ejecutivo", v);
    const query = siguiente.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-2">
      {pendiente && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      <Select value={valor || TODOS} onValueChange={cambiar}>
        <SelectTrigger className="w-full bg-card sm:w-52" aria-label="Filtrar por ejecutivo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos los ejecutivos</SelectItem>
          {ejecutivos.some((e) => e.id === usuarioId) && <SelectItem value={usuarioId}>Mi cartera</SelectItem>}
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
    </div>
  );
}
