"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle, ArrowRightLeft, Loader2, MoreHorizontal, Pencil, UserCheck, UserX } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actualizarUsuario, cambiarEstadoUsuario, reasignarCartera } from "@/lib/usuarios/actions";
import { conDeshacer } from "@/lib/toast";
import { esRolSoloTareas, ROLES, ROLES_CARTERA, rolDescripciones, rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";

type UsuarioFila = { id: string; nombre: string; email: string; rol: RolUsuario; activo: boolean };

const SIN_ASIGNAR = "__sin_asignar__";

/** Menú por fila: editar nombre y rol, desactivar o reactivar la cuenta y reasignar su cartera. */
export function AccionesUsuario({
  usuario,
  esYo,
  cartera,
  otros,
}: {
  usuario: UsuarioFila;
  esYo: boolean;
  /** Lo que tiene asignado: pólizas, clientes y tareas pendientes. */
  cartera: { polizas: number; clientes: number; tareas: number };
  /** Cuentas activas que pueden recibir su cartera. */
  otros: { id: string; nombre: string; rol: RolUsuario }[];
}) {
  const [dialogo, setDialogo] = React.useState<"editar" | "estado" | "cartera" | null>(null);
  const [destino, setDestino] = React.useState("");
  const tieneCartera = cartera.polizas + cartera.clientes + cartera.tareas > 0;
  // Pólizas y clientes solo los lleva un Administrador o un Ejecutivo comercial; las tareas, cualquiera.
  const conPolizas = cartera.polizas + cartera.clientes > 0;
  const destinos = conPolizas ? otros.filter((o) => ROLES_CARTERA.includes(o.rol)) : otros;
  const [nombre, setNombre] = React.useState(usuario.nombre);
  const [rol, setRol] = React.useState<RolUsuario>(usuario.rol);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function abrir(tipo: "editar" | "estado" | "cartera") {
    setNombre(usuario.nombre);
    setRol(usuario.rol);
    setDestino("");
    setError(null);
    setDialogo(tipo);
  }

  function reasignar() {
    startTransition(async () => {
      const res = await reasignarCartera(usuario.id, destino === SIN_ASIGNAR ? "" : destino);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDialogo(null);
      const quien = destino === SIN_ASIGNAR ? "quedan sin asignar" : `pasan a ${otros.find((o) => o.id === destino)?.nombre ?? "su nuevo responsable"}`;
      toast.success(`Cartera de ${usuario.nombre} reasignada`, {
        description: `${res.polizas} ${res.polizas === 1 ? "póliza" : "pólizas"}, ${res.clientes} ${res.clientes === 1 ? "cliente" : "clientes"} y ${res.tareas} ${res.tareas === 1 ? "tarea" : "tareas"} ${quien}.`,
      });
    });
  }

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    startTransition(async () => {
      const res = await actualizarUsuario({ id: usuario.id, nombre, rol });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDialogo(null);
      toast.success("Usuario actualizado", { description: `${nombre.trim()} · ${rolLabels[rol]}` });
    });
  }

  function cambiarEstado() {
    startTransition(async () => {
      const res = await cambiarEstadoUsuario(usuario.id, !usuario.activo);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDialogo(null);
      if (usuario.activo) {
        toast(`Cuenta de ${usuario.nombre} desactivada`, {
          description: "Ya no puede iniciar sesión.",
          ...conDeshacer(() => cambiarEstadoUsuario(usuario.id, true), "La cuenta vuelve a estar activa."),
        });
      } else {
        toast.success(`Cuenta de ${usuario.nombre} reactivada`, { description: "Ya puede iniciar sesión otra vez." });
      }
    });
  }

  const cerrar = (abierto: boolean) => !abierto && !pendiente && setDialogo(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Acciones para ${usuario.nombre}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => abrir("editar")}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!tieneCartera} onSelect={() => abrir("cartera")}>
            <ArrowRightLeft /> Reasignar cartera
          </DropdownMenuItem>
          {!esYo && (
            <>
              <DropdownMenuSeparator />
              {usuario.activo ? (
                <DropdownMenuItem variant="destructive" onSelect={() => abrir("estado")}>
                  <UserX /> Desactivar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => abrir("estado")}>
                  <UserCheck /> Reactivar
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogo === "editar"} onOpenChange={cerrar}>
        <DialogContent>
          <form onSubmit={guardar} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Editar usuario</DialogTitle>
              <DialogDescription>{usuario.email}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor={`nombre-${usuario.id}`}>Nombre</Label>
                <Input
                  id={`nombre-${usuario.id}`}
                  value={nombre}
                  maxLength={100}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`rol-${usuario.id}`}>Rol</Label>
                <Select
                  value={rol}
                  onValueChange={(v) => {
                    setRol(v as RolUsuario);
                    setError(null);
                  }}
                  // Un administrador no puede quitarse el rol a sí mismo.
                  disabled={esYo}
                >
                  <SelectTrigger id={`rol-${usuario.id}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {rolLabels[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {esYo ? "No puedes cambiar tu propio rol." : rolDescripciones[rol]}
                </p>
                {!esYo && conPolizas && esRolSoloTareas(rol) && !esRolSoloTareas(usuario.rol) && (
                  <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    <span>
                      Tiene {cartera.polizas} {cartera.polizas === 1 ? "póliza" : "pólizas"} y {cartera.clientes}{" "}
                      {cartera.clientes === 1 ? "cliente" : "clientes"} a su nombre y con este rol ya no los verá:
                      después pásalos a otro ejecutivo con «Reasignar cartera».
                    </span>
                  </p>
                )}
              </div>
            </div>
            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" /> {error}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pendiente}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Loader2 className="animate-spin" />}
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "cartera"} onOpenChange={cerrar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reasignar la cartera de {usuario.nombre}</DialogTitle>
            <DialogDescription>
              Pasan a otra cuenta sus {cartera.polizas} {cartera.polizas === 1 ? "póliza" : "pólizas"}, {cartera.clientes}{" "}
              {cartera.clientes === 1 ? "cliente" : "clientes"} y {cartera.tareas}{" "}
              {cartera.tareas === 1 ? "tarea pendiente" : "tareas pendientes"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`destino-${usuario.id}`}>Nuevo responsable</Label>
            <Select
              value={destino}
              onValueChange={(v) => {
                setDestino(v);
                setError(null);
              }}
            >
              <SelectTrigger id={`destino-${usuario.id}`} className="w-full">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {destinos.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                    <span className="text-xs text-muted-foreground">{rolLabels[o.rol]}</span>
                  </SelectItem>
                ))}
                <SelectItem value={SIN_ASIGNAR}>Nadie (dejar sin asignar)</SelectItem>
              </SelectContent>
            </Select>
            {conPolizas && (
              <p className="text-xs text-muted-foreground">
                Las pólizas y los clientes solo los recibe un Administrador o un Ejecutivo comercial.
              </p>
            )}
          </div>
          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pendiente}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={reasignar} disabled={pendiente || !destino}>
              {pendiente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Reasignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "estado"} onOpenChange={cerrar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{usuario.activo ? "¿Desactivar la cuenta?" : "¿Reactivar la cuenta?"}</DialogTitle>
            <DialogDescription>
              {usuario.activo
                ? `${usuario.nombre} (${usuario.email}) perderá el acceso de inmediato y no podrá volver a iniciar sesión. La cuenta se conserva y puedes reactivarla después.${tieneCartera ? " Su cartera sigue a su nombre: reasígnala desde el menú." : ""}`
                : `${usuario.nombre} (${usuario.email}) podrá iniciar sesión otra vez con su contraseña anterior y el rol ${rolLabels[usuario.rol]}.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pendiente}>
                Cancelar
              </Button>
            </DialogClose>
            <Button variant={usuario.activo ? "destructive" : "default"} onClick={cambiarEstado} disabled={pendiente}>
              {pendiente ? (
                <Loader2 className="animate-spin" />
              ) : usuario.activo ? (
                <UserX />
              ) : (
                <UserCheck />
              )}
              {usuario.activo ? "Desactivar" : "Reactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
