"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { BusquedaGlobal } from "@/components/layout/busqueda-global";
import { CampanaAvisos } from "@/components/layout/campana-avisos";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cerrarSesion } from "@/lib/auth/actions";
import { allNav, isActivePath } from "@/lib/navigation";

export function AppHeader() {
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
