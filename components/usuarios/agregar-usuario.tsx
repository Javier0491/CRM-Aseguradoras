"use client";

import * as React from "react";
import { AlertCircle, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { crearUsuario, type NuevoUsuarioInput } from "@/lib/usuarios/actions";
import { MAX_PASSWORD, MIN_PASSWORD, ROLES, rolDescripciones, rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";

const VACIO: NuevoUsuarioInput = { nombre: "", email: "", password: "", rol: "EJECUTIVO" };

type Props = {
  disponible: boolean;
  /** Solo para el SUPERADMIN: agencias entre las que puede elegir dónde crear la cuenta. */
  agencias?: { id: string; nombre: string }[];
  /** Agencia que opera la sesión (la preseleccionada). */
  agenciaActivaId?: string;
};

export function AgregarUsuario({ disponible, agencias, agenciaActivaId }: Props) {
  const eligeAgencia = agencias !== undefined && agencias.length > 0;
  const inicial = React.useMemo<NuevoUsuarioInput>(
    () => (eligeAgencia ? { ...VACIO, agenciaId: agenciaActivaId } : VACIO),
    [eligeAgencia, agenciaActivaId]
  );
  const [abierto, setAbierto] = React.useState(false);
  const [datos, setDatos] = React.useState(inicial);
  const [verPassword, setVerPassword] = React.useState(false);
  const [error, setError] = React.useState<{ mensaje: string; campo?: keyof NuevoUsuarioInput } | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function abrir() {
    setDatos(inicial);
    setError(null);
    setVerPassword(false);
    setAbierto(true);
  }

  const actualizar = (cambios: Partial<NuevoUsuarioInput>) => {
    setDatos((d) => ({ ...d, ...cambios }));
    setError(null);
  };

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    startTransition(async () => {
      const res = await crearUsuario(datos);
      if (res.ok) setAbierto(false);
      else setError({ mensaje: res.error, campo: res.campo });
    });
  }

  return (
    <>
      <Button onClick={abrir} disabled={!disponible} title={disponible ? undefined : "Falta SUPABASE_SECRET_KEY"}>
        <UserPlus /> Agregar usuario
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
        <DialogContent>
          <form onSubmit={guardar} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Agregar usuario</DialogTitle>
              <DialogDescription>
                La persona podrá iniciar sesión de inmediato con este correo y contraseña.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              {eligeAgencia && (
                <div className="space-y-2">
                  <Label htmlFor="usr-agencia">Agencia</Label>
                  <Select value={datos.agenciaId} onValueChange={(v) => actualizar({ agenciaId: v })}>
                    <SelectTrigger id="usr-agencia" className="w-full" aria-invalid={error?.campo === "agenciaId"}>
                      <SelectValue placeholder="Selecciona la agencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {agencias.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nombre}
                          {a.id === agenciaActivaId && " (actual)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {datos.agenciaId === agenciaActivaId
                      ? "La cuenta se creará en la agencia que estás operando."
                      : "La cuenta se creará en otra agencia: no aparecerá en esta lista hasta que entres a ella."}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="usr-nombre">Nombre</Label>
                <Input
                  id="usr-nombre"
                  value={datos.nombre}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="Ej. Ana López"
                  onChange={(e) => actualizar({ nombre: e.target.value })}
                  aria-invalid={error?.campo === "nombre"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usr-email">Correo</Label>
                <Input
                  id="usr-email"
                  type="email"
                  value={datos.email}
                  autoComplete="off"
                  placeholder="ana@magnusseguros.com"
                  onChange={(e) => actualizar({ email: e.target.value })}
                  aria-invalid={error?.campo === "email"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usr-password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="usr-password"
                    type={verPassword ? "text" : "password"}
                    value={datos.password}
                    minLength={MIN_PASSWORD}
                    maxLength={MAX_PASSWORD}
                    autoComplete="new-password"
                    onChange={(e) => actualizar({ password: e.target.value })}
                    aria-invalid={error?.campo === "password"}
                    aria-describedby="usr-password-ayuda"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {verPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p id="usr-password-ayuda" className="text-xs text-muted-foreground">
                  Mínimo {MIN_PASSWORD} caracteres. Compártela por un medio seguro.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="usr-rol">Rol</Label>
                <Select value={datos.rol} onValueChange={(v) => actualizar({ rol: v as RolUsuario })}>
                  <SelectTrigger id="usr-rol" className="w-full" aria-invalid={error?.campo === "rol"}>
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
                <p className="text-xs text-muted-foreground">{rolDescripciones[datos.rol]}</p>
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" /> {error.mensaje}
              </p>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pendiente}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pendiente}>
                {pendiente ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Crear usuario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
