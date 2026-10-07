import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getTemaSesion } from "@/lib/agencias/tema";
import { nombrePlataforma } from "@/lib/plataforma/marca";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITIO = "https://crm-aseguradoras-eight.vercel.app";
const titulo = "CRM Aseguradoras | Gestión Inteligente & Automatización para Agentes de Seguros";
const descripcion =
  "Plataforma CRM integral de alta seguridad diseñada para agentes y promotorías de seguros. Centraliza carteras, automatiza seguimiento de pólizas, digitalización de recibos y conciliaciones con rapidez y control total.";

/**
 * Metadatos SEO de la plataforma. El template usa el nombre neutro (PLATAFORMA_NOMBRE…); dentro
 * del CRM, el layout del dashboard lo reemplaza por el de la agencia y el login fija el suyo.
 */
export function generateMetadata(): Metadata {
  const nombre = nombrePlataforma();
  return {
    metadataBase: new URL(SITIO),
    title: { default: titulo, template: `%s · ${nombre}` },
    description: descripcion,
    applicationName: "CRM Aseguradoras",
    keywords: [
      "crm para agentes de seguros",
      "software de seguros mexico",
      "gestion de polizas",
      "plataforma corredores de seguros",
      "conciliacion automatica polizas",
      "crm aseguradoras",
      "software promotorias",
    ],
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "es_MX",
      url: "/",
      siteName: "CRM Aseguradoras",
      title: titulo,
      description: descripcion,
      images: [{ url: "/logo-pj.png", width: 958, height: 780, alt: "CRM Aseguradoras" }],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: ["/logo-pj.png"],
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Tema (oscuro o claro) de la agencia de la sesión; el login usa el oscuro.
  const tema = await getTemaSesion();
  return (
    <html
      lang="es-MX"
      className={`${tema} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        {/* Uno solo, en la raíz: dos Toasters duplicarían cada aviso. */}
        <Toaster theme={tema} />
      </body>
    </html>
  );
}
