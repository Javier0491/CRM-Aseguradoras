import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TemaAgencia } from "@/components/layout/tema-agencia";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getAgencia } from "@/lib/agencias/queries";
import { esAdmin, getCurrentUser, requireUser } from "@/lib/auth/dal";
import { formatFecha } from "@/lib/format";
import { getAlertasPlataforma } from "@/lib/plataforma/alertas";
import { getEstadoPagoAgencia } from "@/lib/plataforma/queries";

/** Las pestañas llevan el nombre de la agencia ("Pólizas · Seguros Ruiz"). */
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return {};
  const { nombre } = await getAgencia(user.agenciaId);
  return { title: { template: `%s · ${nombre}`, default: nombre } };
}

const fecha = (iso: string) => formatFecha(`${iso}T00:00:00Z`);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Segunda línea de defensa tras el proxy: valida la sesión contra Supabase.
  const user = await requireUser();
  const admin = esAdmin(user);
  // White-label: logo, nombre y color de marca de la agencia del usuario.
  const [agencia, pago, alertas] = await Promise.all([
    getAgencia(user.agenciaId),
    // El aviso de pago es para los administradores de la agencia (el SUPERADMIN lo ve en su panel).
    admin && !user.superadmin ? getEstadoPagoAgencia(user.agenciaId) : Promise.resolve(null),
    user.superadmin ? getAlertasPlataforma().catch(() => []) : Promise.resolve([]),
  ]);
  const vencimiento = pago?.pagadoHasta ?? null;

  return (
    <SidebarProvider>
      <TemaAgencia colorHex={agencia.colorHex} />
      <AppSidebar
        email={user.email}
        nombre={user.nombre}
        esAdmin={admin}
        superadmin={user.superadmin}
        agencia={{ nombre: agencia.nombre, logoUrl: agencia.logoUrl }}
      />
      {/* min-w-0: sin él, el contenido ancho (tablas) estira toda la página en vez de hacer scroll. */}
      <SidebarInset className="min-w-0 bg-background">
        <AppHeader
          superadmin={
            user.superadmin
              ? { ajena: user.agenciaId !== user.agenciaPropiaId, alertas: alertas.filter((a) => a.grave).length }
              : undefined
          }
        />
        {/* Solo el SUPERADMIN llega a ver una agencia suspendida. */}
        {agencia.suspendida && (
          <p role="status" className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            Esta agencia está suspendida: sus usuarios no pueden entrar. Reactívala desde Mis agencias.
          </p>
        )}
        {pago && vencimiento && (pago.estado === "por_vencer" || pago.estado === "vencida" || pago.estado === "suspendible") && (
          <p
            role="status"
            className={
              pago.estado === "por_vencer"
                ? "border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning"
                : "border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            }
          >
            {pago.estado === "por_vencer"
              ? `El servicio del CRM está pagado hasta el ${fecha(vencimiento)}. Realiza tu pago para no interrumpirlo.`
              : `El pago del servicio venció el ${fecha(vencimiento)}${
                  pago.limite && pago.estado === "vencida" ? `: regularízalo antes del ${fecha(pago.limite)} para evitar la suspensión` : ""
                }.`}
          </p>
        )}
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
