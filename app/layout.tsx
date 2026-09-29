import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getTemaSesion } from "@/lib/agencias/tema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PJ MAGNUS · CRM",
    template: "%s · PJ MAGNUS",
  },
  description:
    "CRM financiero y operativo para la gestión de pólizas y conciliación de cobranza.",
};

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
      </body>
    </html>
  );
}
