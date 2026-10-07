import {
  BarChart3,
  BellRing,
  Building2,
  FileText,
  LayoutDashboard,
  ListTodo,
  Mail,
  Palette,
  Percent,
  PlugZap,
  RefreshCcw,
  Scale,
  ScanText,
  ScrollText,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

/** admin: rol ADMIN; conciliar: ADMIN y Ejecutivo comercial; superadmin: SUPERADMIN de la plataforma. */
export type Permiso = "admin" | "conciliar" | "superadmin";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Quién lo ve (la página también lo exige en el servidor); sin él, todo el que usa el CRM. */
  permiso?: Permiso;
  /** También lo ve quien solo usa Tareas (Ejecutiva de operación, Líder de oficina y Auxiliar). */
  paraTareas?: boolean;
};

export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Directorio de Clientes", href: "/clientes", icon: Users },
  { title: "Pólizas", href: "/polizas", icon: FileText },
  { title: "Renovaciones", href: "/renovaciones", icon: RefreshCcw },
  { title: "Tareas", href: "/tareas", icon: ListTodo, paraTareas: true },
  { title: "Captura Inteligente", href: "/captura", icon: ScanText },
  { title: "Conciliación de Cobranza", href: "/conciliacion", icon: Scale, permiso: "conciliar" },
  { title: "Comunicaciones", href: "/comunicaciones", icon: Mail },
  { title: "Aseguradoras", href: "/aseguradoras", icon: Building2 },
  { title: "Reportes", href: "/reportes", icon: BarChart3 },
];

export const systemNav: NavItem[] = [
  { title: "Mi agencia", href: "/configuracion/agencia", icon: Palette, permiso: "admin" },
  { title: "Matriz de comisiones", href: "/configuracion/comisiones", icon: Percent, permiso: "superadmin" },
  { title: "Avisos automáticos", href: "/configuracion/avisos", icon: BellRing, permiso: "admin" },
  { title: "Integraciones", href: "/configuracion/integraciones", icon: PlugZap, permiso: "admin" },
  { title: "Usuarios", href: "/sistema/usuarios", icon: UserCog, permiso: "admin" },
  { title: "Bitácora", href: "/sistema/bitacora", icon: ScrollText, permiso: "admin" },
];

export const allNav = [...mainNav, ...systemNav];

export type PermisosNav = Record<Permiso, boolean> & { soloTareas: boolean };

/** Entradas del menú que puede ver la sesión: a quien solo usa Tareas, solo esas. */
export const navPara = (items: NavItem[], p: PermisosNav) =>
  items.filter((i) => (p.soloTareas ? i.paraTareas : !i.permiso || p[i.permiso]));

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
