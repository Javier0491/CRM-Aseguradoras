"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { enviarCorreoPrueba } from "@/lib/plataforma/actions";

/** Botón del diagnóstico: manda un correo de prueba a la cuenta del superadministrador. */
export function PruebaCorreo() {
  const [resultado, setResultado] = React.useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={pendiente}
        onClick={() =>
          startTransition(async () => {
            const r = await enviarCorreoPrueba();
            setResultado(r.ok ? { ok: true, texto: r.mensaje ?? "Enviado." } : { ok: false, texto: r.error });
          })
        }
      >
        {pendiente ? <Loader2 className="animate-spin" /> : <Send />} Enviar correo de prueba
      </Button>
      {resultado && <span className={resultado.ok ? "text-sm text-success" : "text-sm text-destructive"}>{resultado.texto}</span>}
    </div>
  );
}
