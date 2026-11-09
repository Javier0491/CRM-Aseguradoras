"use client";

import * as React from "react";
import { AlertTriangle, Check, FilePenLine, Loader2, Mail } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leerCco, MAX_CCO } from "@/lib/comunicaciones/correo";
import { formatFecha } from "@/lib/format";
import { enviarEndosoAlCliente } from "@/lib/polizas/actions";
import { etiquetaEndoso } from "@/lib/polizas/estatus";

const GENERAL = "general";

export type EndosoParaAviso = {
  id: string;
  tipo: string;
  numero: string | null;
  fecha: Date;
  createdAt: Date;
};

export type AvisoEndosoEnviado = { endosoId: string | null; destinatario: string; fecha: Date };

/**
 * Botón "Endoso" del detalle de una póliza: le avisa al cliente que se realizaron los cambios a su
 * póliza y le manda la versión actualizada (carátula y expediente). Se elige el endoso registrado
 * que se le explica; cada endoso se avisa una vez y el aviso general se puede repetir.
 */
export function EnviarEndoso({
  polizaId,
  email,
  endosos,
  avisos,
  caratula,
}: {
  polizaId: string;
  /** Correo registrado del cliente; vacío si no tiene. */
  email: string;
  /** Endosos registrados, del más reciente al más antiguo. */
  endosos: EndosoParaAviso[];
  avisos: AvisoEndosoEnviado[];
  /** Cuándo se subió la carátula actual (null si no tiene). */
  caratula: { subidaAt: Date | null } | null;
}) {
  const avisados = new Set(avisos.flatMap((a) => (a.endosoId ? [a.endosoId] : [])));
  const pendiente0 = endosos.find((e) => !avisados.has(e.id));
  const [abierto, setAbierto] = React.useState(false);
  const [elegido, setElegido] = React.useState<string>(pendiente0?.id ?? GENERAL);
  const [cco, setCco] = React.useState("");
  const [pendiente, startTransition] = React.useTransition();
  const ccoId = React.useId();
  const selectId = React.useId();

  const sinCorreo = !email.trim();
  const ultimo = avisos[0];
  const endoso = endosos.find((e) => e.id === elegido) ?? null;
  const ocultas = leerCco(cco);
  const errorCco =
    ocultas.invalidos.length > 0
      ? `Correo inválido: ${ocultas.invalidos[0]}`
      : ocultas.correos.length > MAX_CCO
        ? `Máximo ${MAX_CCO} correos.`
        : null;
  // La póliza que se manda es la carátula subida: si es de antes del endoso, quizá no trae los cambios.
  const caratulaVieja =
    endoso && caratula?.subidaAt ? new Date(caratula.subidaAt).getTime() < new Date(endoso.createdAt).getTime() : false;

  function abrir() {
    setElegido(endosos.find((e) => !avisados.has(e.id))?.id ?? GENERAL);
    setAbierto(true);
  }

  function enviar() {
    if (errorCco) return;
    startTransition(async () => {
      const r = await enviarEndosoAlCliente(polizaId, elegido === GENERAL ? null : elegido, ocultas.correos.join(", "));
      if (r.enviado) {
        const copia = ocultas.correos.length > 0 ? ` (copia oculta a ${ocultas.correos.join(", ")})` : "";
        toast.success(`Se le avisó del endoso a ${r.email}${copia}.`);
        setAbierto(false);
        setCco("");
      } else {
        toast.error(`No se envió el aviso de endoso: ${r.motivo}`);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={abrir}
        disabled={sinCorreo}
        title={
          sinCorreo
            ? "El cliente no tiene correo registrado: complétalo en Editar"
            : ultimo
              ? `Último aviso de endoso: ${formatFecha(ultimo.fecha)} a ${ultimo.destinatario}`
              : "Avisar al cliente que se realizaron los cambios a su póliza, con la póliza actualizada"
        }
      >
        <FilePenLine /> Endoso
        {ultimo && !pendiente0 && <Check className="text-success" />}
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avisar al cliente del endoso</DialogTitle>
            <DialogDescription>
              Le llega a <span className="font-medium text-foreground wrap-anywhere">{email}</span> «Se realizaron los
              cambios a tu póliza» con la póliza actualizada: la carátula y el expediente (ZIP) que tiene subidos esta
              póliza.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={selectId} className="text-xs">
              Cambio que se le explica
            </Label>
            <Select value={elegido} onValueChange={setElegido} disabled={pendiente}>
              <SelectTrigger id={selectId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {endosos.map((e) => (
                  <SelectItem key={e.id} value={e.id} disabled={avisados.has(e.id)}>
                    {etiquetaEndoso(e.tipo)} · {formatFecha(e.fecha)}
                    {e.numero ? ` · endoso ${e.numero}` : ""}
                    {avisados.has(e.id) ? " · ya avisado" : ""}
                  </SelectItem>
                ))}
                <SelectItem value={GENERAL}>Aviso general, sin detallar el movimiento</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {endosos.length === 0
                ? "No hay endosos registrados: se envía el aviso general. Regístralo en «Más → Registrar endoso» para detallar el cambio."
                : elegido === GENERAL
                  ? "El correo dice que se aplicaron los cambios, sin detallar cuáles."
                  : "El correo incluye el tipo de movimiento, el número de endoso, la fecha y la descripción."}
            </p>
          </div>

          {(!caratula || caratulaVieja) && (
            <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {!caratula
                ? "Esta póliza no tiene carátula subida: el correo saldrá sin la póliza adjunta. Súbela en Documentos antes de enviar."
                : "La carátula se subió antes de registrar este endoso. Si la póliza cambió, sube la versión actualizada en Documentos antes de enviar."}
            </p>
          )}

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

          {ultimo && (
            <p className="text-xs text-muted-foreground">
              Último aviso de endoso: {formatFecha(ultimo.fecha)} a {ultimo.destinatario}.
            </p>
          )}

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
