import type { Metadata } from "next";

import { Atmosfera } from "@/components/landing/Atmosfera";
import { DemoVip } from "@/components/landing/DemoVip";
import { EstadoLanding } from "@/components/landing/EstadoLanding";
import { HeroB2B } from "@/components/landing/HeroB2B";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { OcrShowcase } from "@/components/landing/OcrShowcase";
import { PricingTiers } from "@/components/landing/PricingTiers";
import { IMAGEN_COMPARTIR } from "@/lib/sitio";

const titulo = "ZenSecure · CRM con IA para Brokers y Agentes de seguros";
const descripcion =
  "CRM para agentes de seguros, brokers y promotorías en México: captura de pólizas con IA, conciliación de recibos y renovaciones. Planes desde $900 MXN al mes. Un producto de Atelier Zenith.";

export const metadata: Metadata = {
  title: { absolute: titulo },
  description: descripcion,
  applicationName: "ZenSecure",
  // Se publica en la raíz (proxy.ts la sirve ahí a quien no tiene sesión).
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: "/",
    siteName: "ZenSecure",
    title: titulo,
    description: descripcion,
    images: [IMAGEN_COMPARTIR],
  },
  twitter: { card: "summary_large_image", title: titulo, description: descripcion, images: [IMAGEN_COMPARTIR.url] },
};

/**
 * Landing pública de ZenSecure. Quien abre la raíz sin sesión la ve ahí (reescritura en
 * proxy.ts); con sesión, la raíz es el dashboard y esta ruta sirve de vista previa.
 */
export default function ZenSecurePage() {
  return (
    // "dark": los componentes de components/ui toman la paleta oscura aunque <html> traiga la clara.
    <div data-landing className="dark relative min-h-svh overflow-x-clip bg-[#030303] text-white">
      <Atmosfera />
      <LandingNav />
      <EstadoLanding>
        <main className="relative z-10">
          <HeroB2B />
          <OcrShowcase />
          <PricingTiers />
          <DemoVip />
        </main>
      </EstadoLanding>
      <LandingFooter />
    </div>
  );
}
