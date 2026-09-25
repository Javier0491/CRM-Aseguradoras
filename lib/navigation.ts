import {
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  Mail,
  Percent,
  PlugZap,
  Scale,
  ScanText,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Directorio de Clientes", href: "/clientes", icon: Users },
  { title: "Pólizas", href: "/polizas", icon: FileText },
  { title: "Captura Inteligente", href: "/captura", icon: ScanText },
  { title: "Conciliación de Cobranza", href: "/conciliacion", icon: Scale },
  { title: "Comunicaciones", href: "/comunicaciones", icon: Mail },
  { title: "Aseguradoras", href: "/aseguradoras", icon: Building2 },
  { title: "Reportes", href: "/reportes", icon: BarChart3 },
];

export const systemNav: NavItem[] = [
  { title: "Matriz de comisiones", href: "/configuracion/comisiones", icon: Percent },
  { title: "Integraciones", href: "/configuracion/integraciones", icon: PlugZap },
];

export const allNav = [...mainNav, ...systemNav];

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
