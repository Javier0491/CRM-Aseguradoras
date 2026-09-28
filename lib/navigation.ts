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
  ScrollText,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Solo visible para el rol ADMIN (la página también lo exige en el servidor). */
  soloAdmin?: boolean;
};

export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Directorio de Clientes", href: "/clientes", icon: Users },
  { title: "Pólizas", href: "/polizas", icon: FileText },
  { title: "Captura Inteligente", href: "/captura", icon: ScanText },
  { title: "Conciliación de Cobranza", href: "/conciliacion", icon: Scale, soloAdmin: true },
  { title: "Comunicaciones", href: "/comunicaciones", icon: Mail },
  { title: "Aseguradoras", href: "/aseguradoras", icon: Building2 },
  { title: "Reportes", href: "/reportes", icon: BarChart3 },
];

export const systemNav: NavItem[] = [
  { title: "Matriz de comisiones", href: "/configuracion/comisiones", icon: Percent, soloAdmin: true },
  { title: "Integraciones", href: "/configuracion/integraciones", icon: PlugZap, soloAdmin: true },
  { title: "Usuarios", href: "/sistema/usuarios", icon: UserCog, soloAdmin: true },
  { title: "Bitácora", href: "/sistema/bitacora", icon: ScrollText, soloAdmin: true },
];

export const allNav = [...mainNav, ...systemNav];

/** Entradas del menú que puede ver un rol. */
export const navPara = (items: NavItem[], esAdmin: boolean) => items.filter((i) => esAdmin || !i.soloAdmin);

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
