import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TemaAgencia } from "@/components/layout/tema-agencia";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getAgencia, getAgenciasParaSuperadmin } from "@/lib/agencias/queries";
import { esAdmin, requireUser } from "@/lib/auth/dal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Segunda línea de defensa tras el proxy: valida la sesión contra Supabase.
  const user = await requireUser();
  // White-label: logo, nombre y color de marca de la agencia del usuario.
  const [agencia, agencias] = await Promise.all([
    getAgencia(user.agenciaId),
    user.superadmin ? getAgenciasParaSuperadmin() : null,
  ]);

  return (
    <SidebarProvider>
      <TemaAgencia colorHex={agencia.colorHex} />
      <AppSidebar
        email={user.email}
        nombre={user.nombre}
        esAdmin={esAdmin(user)}
        agencia={{ nombre: agencia.nombre, logoUrl: agencia.logoUrl }}
      />
      {/* min-w-0: sin él, el contenido ancho (tablas) estira toda la página en vez de hacer scroll. */}
      <SidebarInset className="min-w-0 bg-background">
        <AppHeader
          selectorAgencia={
            agencias ? { agencias, activaId: user.agenciaId, propiaId: user.agenciaPropiaId } : undefined
          }
        />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
