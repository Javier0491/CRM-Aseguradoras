import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { LogoAgencia } from "@/components/layout/logo-agencia";
import { TemaAgencia } from "@/components/layout/tema-agencia";
import { getMarcaLogin } from "@/lib/agencias/marca-login";
import { getCurrentUser } from "@/lib/auth/dal";
import { MONOGRAMA_PLATINO, nombrePlataforma } from "@/lib/plataforma/marca";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

export async function generateMetadata({ searchParams }: PageProps<"/login">): Promise<Metadata> {
  const { agencia } = await searchParams;
  const marca = await getMarcaLogin(typeof agencia === "string" ? agencia : undefined);
  return { title: { absolute: `Iniciar sesión · ${marca?.nombre ?? nombrePlataforma()}` } };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Misma verificación que el layout del CRM (getUser), para no redirigir en ciclo.
  if (await getCurrentUser()) redirect("/");
  const { next, agencia } = await searchParams;
  // Con la liga de la agencia (?agencia=…) o la última que entró en este navegador, su marca; si
  // no, la neutra de la plataforma.
  const marca = await getMarcaLogin(typeof agencia === "string" ? agencia : undefined);
  const nombre = marca?.nombre ?? nombrePlataforma();

  return (
    // La clase del tema también se aplica aquí: con ?agencia=… el <html> aún trae el anterior.
    <main className={cn(marca?.tema, "relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground")}>
      {marca && <TemaAgencia colorHex={marca.colorHex} />}
      {/* Retícula técnica de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {marca ? (
            <LogoAgencia
              nombre={marca.nombre}
              logoUrl={marca.logoUrl}
              className="mb-4 size-14 rounded-xl text-lg shadow-[0_0_40px_-8px_var(--primary)]"
            />
          ) : (
            // Monograma en platino de ZenSecure sobre una ficha oscura: se ve igual con tema claro u oscuro.
            <span className="mb-4 grid size-16 place-items-center rounded-xl border border-white/10 bg-[#030303] shadow-[0_0_40px_-8px_var(--primary)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen fija servida desde /public */}
              <img src={MONOGRAMA_PLATINO} alt="" width={235} height={192} className="h-9 w-auto" />
            </span>
          )}
          <h1 className="text-xl font-semibold tracking-[0.2em] uppercase">{nombre}</h1>
          <p className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">
            {marca ? "Broker de Seguros · CRM" : "CRM para promotorías de seguros"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-2xl shadow-black/40">
          <div className="mb-6 space-y-1">
            <h2 className="text-base font-semibold">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">
              Ingresa con las credenciales que te asignó {marca ? "tu agencia" : "el administrador de tu agencia"}.
            </p>
          </div>
          <LoginForm
            next={typeof next === "string" ? next : undefined}
            configurado={getSupabaseConfig() !== null}
          />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" />
          Acceso restringido · uso interno exclusivo
        </p>
      </div>
    </main>
  );
}
