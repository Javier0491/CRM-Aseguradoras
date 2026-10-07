"use client";

import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * El único <Toaster /> de la aplicación (va en el layout raíz). Toma los colores del tema y de la
 * marca de la agencia: el fondo y el borde de los menús, y el botón de acción ("Deshacer") con el
 * color de marca. En celular se levanta para no tapar la barra de contacto inferior.
 */
export function Toaster({ theme }: { theme: "dark" | "light" }) {
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      mobileOffset={{ bottom: 84, left: 16, right: 16 }}
      icons={{
        success: <CheckCircle2 className="size-4 text-success" />,
        error: <AlertCircle className="size-4 text-destructive" />,
        warning: <TriangleAlert className="size-4 text-warning" />,
        info: <Info className="size-4 text-primary" />,
        loading: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          description: "text-muted-foreground!",
          actionButton: "bg-primary! text-primary-foreground! font-medium!",
          cancelButton: "bg-muted! text-muted-foreground!",
        },
      }}
    />
  );
}
