import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getTemaSesion } from "@/lib/agencias/tema";
import { nombrePlataforma } from "@/lib/plataforma/marca";
import { IMAGEN_COMPARTIR, SITIO } from "@/lib/sitio";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const titulo = "ZenSecure · CRM con IA para Brokers y Agentes de seguros";
const descripcion =
  "CRM para agentes de seguros, brokers y promotorías en México: captura de pólizas con IA, conciliación de recibos, renovaciones y cartera por ejecutivo. Planes desde $900 MXN al mes.";

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
    applicationName: "ZenSecure",
    keywords: [
      "crm para agentes de seguros",
      "crm para brokers de seguros",
      "software de seguros mexico",
      "gestion de polizas",
      "captura de polizas con ia",
      "conciliacion de recibos de seguros",
      "software para promotorias",
      "zensecure",
    ],
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
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: [IMAGEN_COMPARTIR.url],
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
