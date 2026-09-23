"use client";

import { useEffect } from "react";
import { DatabaseZap, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function IntegracionesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <DatabaseZap className="size-8 text-destructive" />
        <p className="font-medium">No fue posible cargar las aseguradoras</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Hubo un problema al consultar la base de datos. Verifica la conexión e inténtalo de nuevo.
          {error.digest && (
            <span className="mt-1 block font-mono text-xs">ref: {error.digest}</span>
          )}
        </p>
        <Button variant="outline" onClick={() => retry()}>
          <RotateCcw /> Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}
