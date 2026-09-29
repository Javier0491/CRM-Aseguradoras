import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAgencia } from "@/lib/agencias/queries";
import { cerrarSesion } from "@/lib/auth/actions";
import { requireSuperadmin } from "@/lib/auth/dal";

/**
 * Plataforma (por encima de las agencias): sin el sidebar ni la marca de ninguna agencia, como un
 * selector de workspaces. Solo SUPERADMIN; la página y las acciones lo vuelven a exigir.
 */
export default async function PlataformaLayout({ children }: LayoutProps<"/">) {
  const user = await requireSuperadmin();
  const activa = await getAgencia(user.agenciaId);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <ShieldCheck className="size-4 text-primary" /> Plataforma
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">· {user.email}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
            <Link href="/">
              <ArrowLeft />
              <span className="max-w-48 truncate">Volver a {activa.nombre}</span>
            </Link>
          </Button>
          <form action={cerrarSesion}>
            <Button type="submit" variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
              <LogOut />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">{children}</main>
    </div>
  );
}
