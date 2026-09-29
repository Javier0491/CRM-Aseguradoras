"use client";

import * as React from "react";
import { Building, ChevronsUpDown, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cambiarAgenciaActiva } from "@/lib/agencias/superadmin";

export type SelectorAgenciaProps = {
  agencias: { id: string; nombre: string }[];
  activaId: string;
  propiaId: string;
};

/**
 * Cambio rápido de agencia (solo SUPERADMIN; el layout no lo renderiza para nadie más y la
 * acción vuelve a verificar el rol en la base de datos). Al elegir otra agencia la sesión pasa a
 * operarla y la app recarga en su dashboard, con sus datos y su marca.
 */
export function SelectorAgencia({ agencias, activaId, propiaId }: SelectorAgenciaProps) {
  const [pendiente, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const activa = agencias.find((a) => a.id === activaId);
  const ajena = activaId !== propiaId;

  function cambiar(id: string) {
    if (id === activaId) return;
    setError(null);
    startTransition(async () => {
      // Si sale bien la acción redirige; solo regresa cuando hay un error.
      const r = await cambiarAgenciaActiva(id);
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pendiente}
          title={error ?? "Cambiar de agencia (superadministrador)"}
          aria-invalid={Boolean(error)}
          // Operando una agencia ajena el botón queda en el color de marca: que no pase desapercibido.
          className={ajena ? "h-8 max-w-56 border-primary/50 bg-primary/10 text-primary" : "h-8 max-w-56"}
        >
          {pendiente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          <span className="hidden truncate md:inline">{activa?.nombre ?? "Agencia"}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Operar como superadministrador en…
        </DropdownMenuLabel>
        {error && <p className="px-2 pb-1.5 text-xs text-destructive">{error}</p>}
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={activaId} onValueChange={cambiar}>
          {agencias.map((a) => (
            <DropdownMenuRadioItem key={a.id} value={a.id} disabled={pendiente}>
              <Building className="text-muted-foreground" />
              <span className="truncate">{a.nombre}</span>
              {a.id === propiaId && <span className="ml-auto text-[10px] text-muted-foreground">propia</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
