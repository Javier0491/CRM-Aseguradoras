"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Aviso } from "@/lib/busqueda/queries";
import { cn } from "@/lib/utils";

const tonos: Record<Aviso["tono"], string> = {
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-sky-500/15 text-sky-400",
};

/** Campana del encabezado: pendientes que requieren acción. Se actualiza al navegar y al abrirla. */
export function CampanaAvisos() {
  const pathname = usePathname();
  const [avisos, setAvisos] = React.useState<Aviso[] | null>(null);
  const [cargando, setCargando] = React.useState(false);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/avisos", { cache: "no-store" });
      if (res.ok) setAvisos(((await res.json()) as { avisos: Aviso[] }).avisos);
    } catch {
      // Sin conexión: se conservan los avisos anteriores.
    } finally {
      setCargando(false);
    }
  }, []);

  // Al cambiar de pantalla (p. ej. después de conciliar o renovar) se refresca el contador.
  React.useEffect(() => {
    const control = new AbortController();
    fetch("/api/avisos", { cache: "no-store", signal: control.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ avisos: Aviso[] }>) : null))
      .then((datos) => datos && setAvisos(datos.avisos))
      .catch(() => {
        // Navegación cancelada o sin conexión: se conservan los avisos anteriores.
      });
    return () => control.abort();
  }, [pathname]);

  const total = avisos?.reduce((s, a) => s + a.cantidad, 0) ?? 0;

  return (
    <DropdownMenu onOpenChange={(abierto) => abierto && void cargar()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={total > 0 ? `Avisos: ${total} pendientes` : "Avisos: sin pendientes"}
        >
          <Bell />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Avisos {cargando && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {avisos === null ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : avisos.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-2 py-5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" /> Todo al día
          </p>
        ) : (
          avisos.map((a) => (
            <DropdownMenuItem key={a.clave} asChild className="items-start gap-3 py-2">
              <Link href={a.href}>
                <span
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums",
                    tonos[a.tono]
                  )}
                >
                  {a.cantidad}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.titulo}</span>
                  <span className="block text-xs whitespace-normal text-muted-foreground">{a.detalle}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
