"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { contactosDeClientes, guardarContactoCliente, type ContactoCargado } from "@/lib/carga-masiva/actions";
import { formatNumero } from "@/lib/format";

/**
 * Clientes de la carga masiva a los que les falta teléfono o correo. El contacto vive en el
 * expediente del cliente: se captura una vez y vale para todas sus pólizas.
 */
export function ContactosPendientes({ clienteIds, actualizando }: { clienteIds: string[]; actualizando: boolean }) {
  const [clientes, setClientes] = React.useState<ContactoCargado[] | null>(null);
  const [buscando, setBuscando] = React.useState(false);

  async function buscar() {
    setBuscando(true);
    const todos = await contactosDeClientes(clienteIds).catch(() => null);
    setBuscando(false);
    if (!todos) return toast.error("No se pudieron consultar los clientes.");
    setClientes(todos.filter((c) => !c.telefono || !c.email));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-primary" /> 3. Clientes sin contacto
        </CardTitle>
        <CardDescription>
          El teléfono y el correo son del cliente, no de la póliza: captúralos una vez aquí y quedan en todas sus
          pólizas, las que ya tiene y las que se carguen después.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => void buscar()} disabled={buscando}>
          {buscando && <Loader2 className="animate-spin" />}
          {clientes
            ? "Actualizar la lista"
            : clienteIds.length === 1
              ? "Revisar al cliente cargado"
              : `Buscar entre los ${formatNumero(clienteIds.length)} clientes cargados`}
        </Button>
        {actualizando && clientes && (
          <p className="text-xs text-muted-foreground">La carga sigue: actualiza la lista al terminar para ver los nuevos.</p>
        )}
        {clientes &&
          (clientes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" /> Todos los clientes cargados tienen teléfono y correo.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {clientes.map((c) => (
                <FilaContacto key={c.id} cliente={c} />
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}

function FilaContacto({ cliente }: { cliente: ContactoCargado }) {
  const [telefono, setTelefono] = React.useState(cliente.telefono);
  const [email, setEmail] = React.useState(cliente.email);
  const [errores, setErrores] = React.useState<{ telefono?: string; email?: string }>({});
  const [guardando, setGuardando] = React.useState(false);
  const [guardado, setGuardado] = React.useState(false);
  const id = `contacto-${cliente.id}`;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await guardarContactoCliente(cliente.id, { telefono, email });
    setGuardando(false);
    if (res.ok) {
      setTelefono(res.telefono);
      setEmail(res.email);
      setErrores({});
      setGuardado(true);
      toast.success(
        cliente.polizas === 1
          ? `Contacto de ${cliente.nombre} guardado`
          : `Contacto de ${cliente.nombre} guardado en sus ${formatNumero(cliente.polizas)} pólizas`
      );
    } else {
      setErrores(res.errores ?? {});
      if (res.error) toast.error(res.error);
    }
  }

  return (
    <li>
      <form onSubmit={guardar} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-start">
        <div className="min-w-0">
          <Link href={`/clientes/${cliente.id}`} target="_blank" className="text-sm font-medium hover:text-primary hover:underline [overflow-wrap:anywhere]">
            {cliente.nombre}
          </Link>
          <p className="text-xs text-muted-foreground">
            RFC <span className="font-mono">{cliente.rfc}</span> · {formatNumero(cliente.polizas)}{" "}
            {cliente.polizas === 1 ? "póliza" : "pólizas"}
          </p>
        </div>
        <div>
          <Input
            id={`${id}-tel`}
            type="tel"
            inputMode="tel"
            placeholder="Teléfono (10 dígitos)"
            aria-label={`Teléfono de ${cliente.nombre}`}
            aria-invalid={Boolean(errores.telefono)}
            value={telefono}
            onChange={(e) => {
              setTelefono(e.target.value);
              setGuardado(false);
            }}
          />
          {errores.telefono && <p className="mt-1 text-xs text-destructive">{errores.telefono}</p>}
        </div>
        <div>
          <Input
            id={`${id}-email`}
            type="email"
            placeholder="Correo"
            aria-label={`Correo de ${cliente.nombre}`}
            aria-invalid={Boolean(errores.email)}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setGuardado(false);
            }}
          />
          {errores.email && <p className="mt-1 text-xs text-destructive">{errores.email}</p>}
        </div>
        <Button type="submit" size="sm" variant={guardado ? "ghost" : "default"} disabled={guardando || guardado} className="h-9">
          {guardando ? <Loader2 className="animate-spin" /> : guardado ? <CheckCircle2 className="text-success" /> : <Save />}
          {guardado ? "Guardado" : "Guardar"}
        </Button>
      </form>
    </li>
  );
}
