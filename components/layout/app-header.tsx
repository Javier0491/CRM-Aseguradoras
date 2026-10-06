"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, LogOut } from "lucide-react";

import { BusquedaGlobal } from "@/components/layout/busqueda-global";
import { CampanaAvisos } from "@/components/layout/campana-avisos";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cerrarSesion } from "@/lib/auth/actions";
import { allNav, isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * `superadmin` solo llega para un SUPERADMIN: botón al panel de agencias. `ajena` = está operando
 * una agencia que no es la suya (el botón se resalta para que no pase desapercibido); `alertas`,
 * problemas graves de la plataforma (migraciones, tarea diaria) que se marcan con un punto.
 */
export function AppHeader({ superadmin }: { superadmin?: { ajena: boolean; alertas?: number } }) {
  const pathname = usePathname();
  const current =
    allNav.find((item) => isActivePath(pathname, item.href)) ?? allNav[0];

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />
      <span className="text-sm font-medium">{current.title}</span>

      <div className="ml-auto flex items-center gap-2">
        {superadmin && (
          <Button
            asChild
            variant="outline"
            size="sm"
            title={
              superadmin.alertas
                ? `Panel de agencias: ${superadmin.alertas} ${superadmin.alertas === 1 ? "alerta" : "alertas"} de la plataforma`
                : "Panel de agencias (superadministrador)"
            }
            className={cn("relative h-8", superadmin.ajena && "border-primary/50 bg-primary/10 text-primary")}
          >
            <Link href="/superadmin">
              <LayoutGrid />
              <span className="hidden md:inline">Mis agencias</span>
              {Boolean(superadmin.alertas) && (
                <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Link>
          </Button>
        )}
        <BusquedaGlobal />
        <CampanaAvisos />
        <form action={cerrarSesion}>
          <Button type="submit" variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
            <LogOut />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
