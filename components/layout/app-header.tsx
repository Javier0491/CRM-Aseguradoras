"use client";

import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
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
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar póliza, cliente o recibo…"
            className="h-8 w-72 bg-card pl-8 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Notificaciones"
        >
          <Bell />
        </Button>
      </div>
    </header>
  );
}
