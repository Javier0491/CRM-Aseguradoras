"use client";

import { Construction, KeyRound, Settings2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AseguradoraIntegracion } from "@/lib/integraciones/data";

export function ConfigurarApiDialog({
  aseguradora,
}: {
  aseguradora: AseguradoraIntegracion;
}) {
  const prefijo = `api-${aseguradora.id}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Settings2 /> Configurar API
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            Integración API · {aseguradora.nombre}
          </DialogTitle>
          <DialogDescription>
            Credenciales para la conexión oficial con los servicios de cobranza de la
            aseguradora.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-primary/30 bg-primary/[0.06] text-primary">
          <Construction />
          <AlertTitle>Funcionalidad en desarrollo para la Fase 4</AlertTitle>
          <AlertDescription className="text-primary/80">
            La conexión y el almacenamiento cifrado de credenciales aún no están
            disponibles. Los datos capturados aquí no se guardan.
          </AlertDescription>
        </Alert>

        <form
          className="space-y-4"
          autoComplete="off"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="space-y-2">
            <Label htmlFor={`${prefijo}-key`} className="text-xs">
              API Key
            </Label>
            <Input
              id={`${prefijo}-key`}
              type="password"
              placeholder="pk_live_••••••••••••"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefijo}-secret`} className="text-xs">
              API Secret
            </Label>
            <Input
              id={`${prefijo}-secret`}
              type="password"
              placeholder="••••••••••••••••••••"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefijo}-endpoint`} className="text-xs">
              Endpoint URL
            </Label>
            <Input
              id={`${prefijo}-endpoint`}
              type="url"
              inputMode="url"
              placeholder="https://api.aseguradora.com/v1"
              defaultValue={aseguradora.api_endpoint ?? ""}
              className="font-mono"
            />
          </div>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button disabled title="Disponible en la Fase 4">
            Guardar configuración
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
