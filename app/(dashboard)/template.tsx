import { EntradaPagina } from "@/components/layout/entrada-pagina";

/** Cada página del CRM entra con un fundido corto (el template se vuelve a montar al navegar). */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <EntradaPagina>{children}</EntradaPagina>;
}
