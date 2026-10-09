"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { MarcaZenSecure } from "@/components/landing/MarcaZenSecure";
import { cn } from "@/lib/utils";

const SECCIONES = [
  { href: "#ia", texto: "Captura con IA" },
  { href: "#planes", texto: "Planes" },
  { href: "#demo", texto: "Demo VIP" },
];

function suscribirDesplazamiento(avisar: () => void) {
  window.addEventListener("scroll", avisar, { passive: true });
  return () => window.removeEventListener("scroll", avisar);
}

/** Barra superior: transparente sobre el hero y de cristal en cuanto la página se desplaza. */
export function LandingNav() {
  const desplazado = useSyncExternalStore(suscribirDesplazamiento, () => window.scrollY > 24, () => false);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b [transition:background-color_300ms_ease,border-color_300ms_ease]",
        desplazado ? "border-white/[0.06] bg-[#030303]/65 backdrop-blur-xl" : "border-transparent bg-transparent"
      )}
    >
      <nav aria-label="Principal" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#" aria-label="ZenSecure by Atelier Zenith, inicio" className="rounded-md">
          <MarcaZenSecure />
        </a>
        <ul className="hidden items-center gap-8 text-[13px] text-white/55 md:flex">
          {SECCIONES.map((s) => (
            <li key={s.href}>
              <a href={s.href} className="[transition:color_200ms_ease] hover:text-white">
                {s.texto}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-white/75 [transition:color_200ms_ease,background-color_200ms_ease] hover:bg-white/[0.06] hover:text-white"
          >
            Iniciar sesión
          </Link>
          <a
            href="#demo"
            className="hidden h-9 items-center rounded-full bg-white px-4 text-[13px] font-medium text-[#030303] [transition:scale_160ms_var(--ease-out),background-color_200ms_ease] hover:bg-[#dfe4ee] active:scale-[0.97] sm:inline-flex"
          >
            Agendar demo
          </a>
        </div>
      </nav>
    </header>
  );
}
