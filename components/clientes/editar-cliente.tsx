"use client";

import * as React from "react";
import { Loader2, Pencil, Save } from "lucide-react";
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
import { actualizarCliente } from "@/lib/clientes/actions";
import { TIPOS_PERSONA, type ClienteValores, type ErroresCliente } from "@/lib/clientes/reglas";
import { conDeshacer } from "@/lib/toast";
import { cn } from "@/lib/utils";

const SIN_EJECUTIVO = "__sin_asignar__";

type Campo = { name: keyof ClienteValores; label: string; type?: string; placeholder?: string; wide?: boolean; inputMode?: "tel" | "email" | "numeric" };

const CAMPOS: Campo[] = [
  { name: "nombre", label: "Nombre o razón social", wide: true },
  { name: "rfc", label: "RFC", placeholder: "12 o 13 caracteres" },
  { name: "telefono", label: "Teléfono", type: "tel", placeholder: "10 dígitos", inputMode: "tel" },
  { name: "email", label: "Correo", type: "email", wide: true, inputMode: "email" },
  { name: "direccion", label: "Calle, número y colonia", wide: true },
  { name: "municipio", label: "Municipio o alcaldía" },
  { name: "estado", label: "Estado" },
  { name: "codigoPostal", label: "Código postal", placeholder: "5 dígitos", inputMode: "numeric" },
];

/** Botón y diálogo para editar el expediente del cliente (contacto, dirección, tipo y ejecutivo). */
export function EditarCliente({
  cliente,
  ejecutivos,
}: {
  cliente: ClienteValores & { id: string; ejecutivoId: string | null };
  /** Sin la lista no se muestra el selector (el ejecutivo que solo ve su cartera). */
  ejecutivos?: { id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [valores, setValores] = React.useState<ClienteValores>(cliente);
  const [ejecutivo, setEjecutivo] = React.useState(cliente.ejecutivoId ?? "");
  const [errores, setErrores] = React.useState<ErroresCliente>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  const cambiar = (k: keyof ClienteValores) => (v: string) => {
    setValores((p) => ({ ...p, [k]: v }));
    setErrores((p) => ({ ...p, [k]: undefined }));
  };

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await actualizarCliente(cliente.id, { ...valores, ...(ejecutivos && { ejecutivoId: ejecutivo }) });
      if (r.ok) {
        setAbierto(false);
        // Deshacer regresa los datos con los que se abrió el diálogo.
        const { id, ejecutivoId, ...anteriores } = cliente;
        toast.success("Cliente actualizado", {
          description: valores.nombre,
          ...conDeshacer(
            () => actualizarCliente(id, { ...anteriores, ...(ejecutivos && { ejecutivoId: ejecutivoId ?? "" }) }),
            "Se restauraron los datos anteriores."
          ),
        });
      } else {
        setErrores(r.errores ?? {});
        setError(r.error ?? null);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setValores(cliente);
          setEjecutivo(cliente.ejecutivoId ?? "");
          setErrores({});
          setError(null);
          setAbierto(true);
        }}
      >
        <Pencil /> Editar
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={guardar} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Editar cliente</DialogTitle>
              <DialogDescription>Los cambios se ven en todas sus pólizas.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              {CAMPOS.map((c) => (
                <div key={c.name} className={cn("space-y-2", c.wide && "sm:col-span-2")}>
                  <Label htmlFor={`cliente-${c.name}`}>{c.label}</Label>
                  <Input
                    id={`cliente-${c.name}`}
                    type={c.type ?? "text"}
                    inputMode={c.inputMode}
                    value={valores[c.name]}
                    placeholder={c.placeholder}
                    onChange={(e) => cambiar(c.name)(e.target.value)}
                    aria-invalid={Boolean(errores[c.name])}
                    className={cn(c.name === "rfc" && "font-mono uppercase")}
                  />
                  {errores[c.name] && <p className="text-xs text-destructive">{errores[c.name]}</p>}
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="cliente-tipo">Tipo de persona</Label>
                <Select value={valores.tipoPersona} onValueChange={cambiar("tipoPersona")}>
                  <SelectTrigger id="cliente-tipo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_PERSONA.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cliente-nacimiento">
                  {valores.tipoPersona === "MORAL" ? "Fecha de constitución" : "Fecha de nacimiento"}
                </Label>
                <Input
                  id="cliente-nacimiento"
                  type="date"
                  value={valores.fechaNacimiento}
                  onChange={(e) => cambiar("fechaNacimiento")(e.target.value)}
                  aria-invalid={Boolean(errores.fechaNacimiento)}
                />
                {errores.fechaNacimiento ? (
                  <p className="text-xs text-destructive">{errores.fechaNacimiento}</p>
                ) : (
                  valores.tipoPersona === "FISICA" && (
                    <p className="text-xs text-muted-foreground">Si la dejas vacía se toma la del RFC.</p>
                  )
                )}
              </div>
              {ejecutivos && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cliente-ejecutivo">Ejecutivo responsable</Label>
                  <Select value={ejecutivo || SIN_EJECUTIVO} onValueChange={(v) => setEjecutivo(v === SIN_EJECUTIVO ? "" : v)}>
                    <SelectTrigger id="cliente-ejecutivo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_EJECUTIVO}>Sin asignar</SelectItem>
                      {ejecutivo && !ejecutivos.some((e) => e.id === ejecutivo) && (
                        <SelectItem value={ejecutivo}>Cuenta desactivada</SelectItem>
                      )}
                      {ejecutivos.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Las pólizas conservan su propio ejecutivo; cámbialo en cada una si también se reasignan.
                  </p>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pendiente}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pendiente}>
                {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
