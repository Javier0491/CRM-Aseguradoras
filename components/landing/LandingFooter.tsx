import Link from "next/link";

import { MarcaZenSecure } from "@/components/landing/MarcaZenSecure";

export function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/[0.06] bg-[#030303]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <MarcaZenSecure />
          <p className="text-xs text-white/40">CRM con IA para corredurías de seguros.</p>
        </div>
        <nav aria-label="Pie de página" className="flex flex-wrap gap-x-7 gap-y-3 text-[13px] text-white/50">
          <a href="#ia" className="[transition:color_200ms_ease] hover:text-white">
            Captura con IA
          </a>
          <a href="#planes" className="[transition:color_200ms_ease] hover:text-white">
            Planes
          </a>
          <a href="#demo" className="[transition:color_200ms_ease] hover:text-white">
            Demo VIP
          </a>
          <Link href="/login" className="[transition:color_200ms_ease] hover:text-white">
            Iniciar sesión
          </Link>
        </nav>
      </div>
      <div className="border-t border-white/[0.04]">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[11px] text-white/30 sm:px-6">
          © {new Date().getFullYear()} Atelier Zenith. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
