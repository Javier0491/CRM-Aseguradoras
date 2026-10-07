"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";

import { LogoAgencia } from "@/components/layout/logo-agencia";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cerrarSesion } from "@/lib/auth/actions";
import { isActivePath, mainNav, navPara, systemNav, type NavItem, type PermisosNav } from "@/lib/navigation";

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] uppercase tracking-wider">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={isActivePath(pathname, item.href)}
                tooltip={item.title}
                className="data-[active=true]:text-primary data-[active=true]:[&>svg]:text-primary"
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function inicialesDe(email: string | null) {
  const nombre = email?.split("@")[0] ?? "";
  const partes = nombre.split(/[._-]+/).filter(Boolean);
  const ini = partes.length > 1 ? partes[0][0] + partes[1][0] : nombre.slice(0, 2);
  return ini.toUpperCase() || "?";
}

export function AppSidebar({
  email,
  nombre,
  rol,
  permisos,
  agencia,
}: {
  email: string | null;
  nombre: string | null;
  /** Nombre del rol para mostrar ("Ejecutivo comercial"). */
  rol: string;
  permisos: PermisosNav;
  agencia: { nombre: string; logoUrl: string | null };
}) {
  const pathname = usePathname();
  const operacion = navPara(mainNav, permisos);
  const sistema = navPara(systemNav, permisos);
  // Quien solo usa Tareas no tiene dashboard: el logo lo lleva a sus tareas.
  const inicio = permisos.soloTareas ? "/tareas" : "/";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={agencia.nombre}>
              <Link href={inicio}>
                {/* 32 px: también es el tamaño del botón con el menú colapsado. */}
                <LogoAgencia nombre={agencia.nombre} logoUrl={agencia.logoUrl} />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
                    {agencia.nombre}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    Broker de Seguros
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="Operación" items={operacion} pathname={pathname} />
        {sistema.length > 0 && <NavGroup label="Sistema" items={sistema} pathname={pathname} />}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip="Mi cuenta">
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md bg-secondary text-xs">
                      {inicialesDe(email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{nombre ?? "Sesión activa"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {email ?? "Usuario"}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {email}
                  <span className="block text-[11px] text-primary">{rol}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <form action={cerrarSesion}>
                  <DropdownMenuItem asChild variant="destructive">
                    <button type="submit" className="w-full">
                      <LogOut /> Cerrar sesión
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
