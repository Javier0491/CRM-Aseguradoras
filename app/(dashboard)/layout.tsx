import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TemaAgencia } from "@/components/layout/tema-agencia";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getAgencia } from "@/lib/agencias/queries";
import { esAdmin, requireUser } from "@/lib/auth/dal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Segunda línea de defensa tras el proxy: valida la sesión contra Supabase.
  const user = await requireUser();
  // White-label: logo, nombre y color de marca de la agencia del usuario.
  const agencia = await getAgencia(user.agenciaId);

  return (
    <SidebarProvider>
      <TemaAgencia colorHex={agencia.colorHex} />
      <AppSidebar
        email={user.email}
        nombre={user.nombre}
        esAdmin={esAdmin(user)}
        superadmin={user.superadmin}
        agencia={{ nombre: agencia.nombre, logoUrl: agencia.logoUrl }}
      />
      {/* min-w-0: sin él, el contenido ancho (tablas) estira toda la página en vez de hacer scroll. */}
      <SidebarInset className="min-w-0 bg-background">
        <AppHeader superadmin={user.superadmin ? { ajena: user.agenciaId !== user.agenciaPropiaId } : undefined} />
        {/* Solo el SUPERADMIN llega a ver una agencia suspendida. */}
        {agencia.suspendida && (
          <p role="status" className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            Esta agencia está suspendida: sus usuarios no pueden entrar. Reactívala desde Mis agencias.
          </p>
        )}
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
