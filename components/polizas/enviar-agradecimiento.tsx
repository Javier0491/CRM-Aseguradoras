"use client";

import * as React from "react";
import { Check, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFecha } from "@/lib/format";
import { enviarAgradecimientoDeRenovacion } from "@/lib/polizas/actions";

/**
 * Botón del detalle de una renovación para mandarle al cliente «¡Gracias por continuar con
 * nosotros!» con la vigencia nueva, la carátula y el expediente. Sirve cuando la renovación se
 * capturó sin el agradecimiento (p. ej. se subió sin "Renovar" y se ligó sola). Sale una sola vez:
 * ya enviado, solo dice a quién y cuándo.
 */
export function EnviarAgradecimiento({
  polizaId,
  email,
  enviado,
}: {
  polizaId: string;
  /** Correo registrado del cliente; vacío si no tiene. */
  email: string;
  enviado: { destinatario: string; fecha: Date } | null;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [pendiente, startTransition] = React.useTransition();

  if (enviado) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="text-muted-foreground disabled:opacity-100"
        title={`Se envió a ${enviado.destinatario} el ${formatFecha(enviado.fecha)}`}
      >
        <Check className="text-success" /> Agradecimiento enviado
      </Button>
    );
  }

  const sinCorreo = !email.trim();

  function enviar() {
    startTransition(async () => {
      const r = await enviarAgradecimientoDeRenovacion(polizaId);
      if (r.enviado) {
        toast.success(`Se le envió el agradecimiento por renovar a ${r.email}.`);
        setAbierto(false);
      } else {
        toast.error(`No se envió el agradecimiento: ${r.motivo}`);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAbierto(true)}
        disabled={sinCorreo}
        title={sinCorreo ? "El cliente no tiene correo registrado: complétalo en Editar" : "Enviar al cliente el agradecimiento por renovar"}
      >
        <Mail /> Enviar al cliente
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar el agradecimiento por renovar</DialogTitle>
            <DialogDescription>
              Le llega a <span className="font-medium text-foreground wrap-anywhere">{email}</span> «¡Gracias por continuar
              con nosotros!» con la vigencia nueva y, adjuntos, la carátula y el expediente (ZIP) de esta póliza. Se envía
              una sola vez.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pendiente}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Mail />}
              {pendiente ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
