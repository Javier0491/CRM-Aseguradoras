import type { Metadata } from "next";

import { Atmosfera } from "@/components/landing/Atmosfera";
import { DemoVip } from "@/components/landing/DemoVip";
import { EstadoLanding } from "@/components/landing/EstadoLanding";
import { HeroB2B } from "@/components/landing/HeroB2B";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { OcrShowcase } from "@/components/landing/OcrShowcase";
import { PricingTiers } from "@/components/landing/PricingTiers";

const titulo = "ZenSecure · CRM con IA para corredurías de seguros";
const descripcion =
  "Automatiza la conciliación de recibos, gestiona pólizas en segundos y escala tu agencia sin límites. Un producto de Atelier Zenith.";

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
    images: [{ url: "/marca/plataforma.png", width: 256, height: 256, alt: "ZenSecure by Atelier Zenith" }],
  },
  twitter: { card: "summary", title: titulo, description: descripcion, images: ["/marca/plataforma.png"] },
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
