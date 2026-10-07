"use client";

import * as React from "react";
import Link from "next/link";
import { Combine, Loader2 } from "lucide-react";
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
import { fusionarClientes } from "@/lib/clientes/actions";
import { formatNumero } from "@/lib/format";

type Duplicado = {
  id: string;
  nombre: string;
  rfc: string;
  telefono: string;
  email: string;
  _count: { polizas: number };
};

/**
 * Clientes que pueden ser el mismo (mismo RFC, RFC casi igual o mismo nombre) con la opción de
 * fusionarlos en este expediente. Solo lo ve un administrador.
 */
export function DuplicadosCliente({ destino, duplicados }: { destino: { id: string; nombre: string }; duplicados: Duplicado[] }) {
  const [origen, setOrigen] = React.useState<Duplicado | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  return (
    <>
      <ul className="divide-y">
        {duplicados.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1 basis-40">
              <Link
                href={`/clientes/${d.id}`}
                title={d.nombre}
                className="block truncate text-sm font-medium hover:text-primary hover:underline"
              >
                {d.nombre}
              </Link>
              <p className="text-xs text-muted-foreground wrap-anywhere">
                <span className="font-mono">{d.rfc}</span> · {formatNumero(d._count.polizas)}{" "}
                {d._count.polizas === 1 ? "póliza" : "pólizas"}
                {d.telefono && ` · ${d.telefono}`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setOrigen(d);
              }}
            >
              <Combine /> Fusionar aquí
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={origen !== null} onOpenChange={(v) => !v && !pendiente && setOrigen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Fusionar los clientes?</DialogTitle>
            <DialogDescription>
              {origen && (
                <>
                  <strong>{origen.nombre}</strong> ({origen.rfc}) se integra a <strong>{destino.nombre}</strong>: sus{" "}
                  {origen._count.polizas} {origen._count.polizas === 1 ? "póliza pasa" : "pólizas pasan"} a este expediente,
                  junto con su seguimiento y sus tareas, y se completan los datos de contacto que falten. Después se borra.
                  No se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pendiente}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              disabled={pendiente || !origen}
              onClick={() =>
                origen &&
                startTransition(async () => {
                  const r = await fusionarClientes(destino.id, origen.id);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setOrigen(null);
                  toast.success("Clientes fusionados", { description: `${origen.nombre} quedó integrado a ${destino.nombre}.` });
                })
              }
            >
              {pendiente ? <Loader2 className="animate-spin" /> : <Combine />} Fusionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
