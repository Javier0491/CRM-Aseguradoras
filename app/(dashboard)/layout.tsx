import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { esAdmin, requireUser } from "@/lib/auth/dal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Segunda línea de defensa tras el proxy: valida la sesión contra Supabase.
  const user = await requireUser();

  return (
    <SidebarProvider>
      <AppSidebar email={user.email} nombre={user.nombre} esAdmin={esAdmin(user)} />
      {/* min-w-0: sin él, el contenido ancho (tablas) estira toda la página en vez de hacer scroll. */}
      <SidebarInset className="min-w-0 bg-background">
        <AppHeader />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
