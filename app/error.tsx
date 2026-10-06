"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { EstadoSistema } from "@/components/layout/estado-sistema";
import { Button } from "@/components/ui/button";

/** Error inesperado en una página o en un layout anidado (el del CRM o el de la plataforma). */
export default function ErrorApp({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="max-w-md space-y-3 text-center">
        <AlertTriangle className="mx-auto size-8 text-destructive" />
        <h1 className="text-lg font-semibold">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          No se pudo cargar esta pantalla. Intenta de nuevo; si sigue igual, avisa al administrador de la plataforma.
          {error.digest && <span className="mt-1 block font-mono text-xs">ref: {error.digest}</span>}
        </p>
        <EstadoSistema />
        <Button variant="outline" onClick={() => retry()}>
          <RotateCcw /> Reintentar
        </Button>
      </div>
    </main>
  );
}
