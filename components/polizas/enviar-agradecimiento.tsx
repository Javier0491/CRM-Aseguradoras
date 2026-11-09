"use client";

import * as React from "react";
import { Check, Loader2, Mail, Sparkles } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leerCco, MAX_CCO } from "@/lib/comunicaciones/correo";
import { formatFecha } from "@/lib/format";
import { enviarAgradecimientoDeRenovacion, enviarPolizaNuevaAlCliente } from "@/lib/polizas/actions";

/** Textos y acción de cada correo que le entrega al cliente su póliza. */
const CLASES = {
  renovacion: {
    accion: enviarAgradecimientoDeRenovacion,
    boton: "Enviar al cliente",
    icono: Mail,
    ayuda: "Enviar al cliente el agradecimiento por renovar",
    yaEnviado: "Agradecimiento enviado",
    que: "el agradecimiento por renovar",
    titulo: "Enviar el agradecimiento por renovar",
    contenido: "«¡Gracias por continuar con nosotros!» con la vigencia nueva",
  },
  nueva: {
    accion: enviarPolizaNuevaAlCliente,
    boton: "Nuevo",
    icono: Sparkles,
    ayuda: "Enviar al cliente su póliza nueva con el aviso de que ya está lista",
    yaEnviado: "Póliza nueva enviada",
    que: "su póliza nueva",
    titulo: "Enviar al cliente su póliza nueva",
    contenido: "«¡Tu nueva póliza ya está lista!» con el número y la vigencia",
  },
} as const;

/**
 * Botón del detalle de una póliza para entregarle al cliente su póliza por correo, con la carátula y
 * el expediente: en una renovación, «¡Gracias por continuar con nosotros!»; en una póliza nueva
 * ("Nuevo"), «¡Tu nueva póliza ya está lista!». Sale una sola vez: ya enviado, solo dice a quién y
 * cuándo.
 */
export function EnviarAgradecimiento({
  polizaId,
  clase,
  email,
  enviado,
}: {
  polizaId: string;
  clase: keyof typeof CLASES;
  /** Correo registrado del cliente; vacío si no tiene. */
  email: string;
  enviado: { destinatario: string; fecha: Date } | null;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [cco, setCco] = React.useState("");
  const [pendiente, startTransition] = React.useTransition();
  const t = CLASES[clase];
  const ccoId = React.useId();

  if (enviado) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="text-muted-foreground disabled:opacity-100"
        title={`Se envió a ${enviado.destinatario} el ${formatFecha(enviado.fecha)}`}
      >
        <Check className="text-success" /> {t.yaEnviado}
      </Button>
    );
  }

  const sinCorreo = !email.trim();
  const Icono = t.icono;
  const ocultas = leerCco(cco);
  const errorCco =
    ocultas.invalidos.length > 0
      ? `Correo inválido: ${ocultas.invalidos[0]}`
      : ocultas.correos.length > MAX_CCO
        ? `Máximo ${MAX_CCO} correos.`
        : null;

  function enviar() {
    if (errorCco) return;
    startTransition(async () => {
      const r = await t.accion(polizaId, ocultas.correos.join(", "));
      if (r.enviado) {
        const copia = ocultas.correos.length > 0 ? ` (copia oculta a ${ocultas.correos.join(", ")})` : "";
        toast.success(`Se le envió ${t.que} a ${r.email}${copia}.`);
        setAbierto(false);
        setCco("");
      } else {
        toast.error(`No se envió ${t.que}: ${r.motivo}`);
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
        title={sinCorreo ? "El cliente no tiene correo registrado: complétalo en Editar" : t.ayuda}
      >
        <Icono /> {t.boton}
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.titulo}</DialogTitle>
            <DialogDescription>
              Le llega a <span className="font-medium text-foreground wrap-anywhere">{email}</span> {t.contenido} y,
              adjuntos, la carátula y el expediente (ZIP) de esta póliza. Se envía una sola vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={ccoId} className="text-xs">
              CCO (copia oculta, opcional)
            </Label>
            <Input
              id={ccoId}
              type="text"
              inputMode="email"
              autoComplete="off"
              value={cco}
              onChange={(e) => setCco(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pendiente && enviar()}
              disabled={pendiente}
              maxLength={1000}
              placeholder="correo@ejemplo.com, otro@ejemplo.com"
              aria-invalid={errorCco ? true : undefined}
              aria-describedby={`${ccoId}-ayuda`}
            />
            <p id={`${ccoId}-ayuda`} className={errorCco ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {errorCco ?? "Reciben una copia sin que el cliente lo vea. Separa varios con comas."}
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pendiente}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={enviar} disabled={pendiente || !!errorCco}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Mail />}
              {pendiente ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
