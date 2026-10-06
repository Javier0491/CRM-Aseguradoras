"use client";

import * as React from "react";
import { Check, CheckCircle2, Copy, Link2, Loader2, Save, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actualizarAjustesAgencia, type AjustesAgenciaState } from "@/lib/agencias/actions";
import { normalizarSlug } from "@/lib/agencias/slug";

/** El dominio no cambia mientras la página está abierta: no hay a qué suscribirse. */
const sinSuscripcion = () => () => {};

/**
 * Ajustes de operación de la agencia: su liga de acceso con marca y si cada ejecutivo ve solo su
 * cartera de clientes y pólizas.
 */
export function AjustesOperacion({ slug, carteraPorEjecutivo }: { slug: string; carteraPorEjecutivo: boolean }) {
  const [valorSlug, setValorSlug] = React.useState(slug);
  const [cartera, setCartera] = React.useState(carteraPorEjecutivo);
  // El dominio solo se conoce en el navegador (en el servidor queda vacío).
  const origen = React.useSyncExternalStore(
    sinSuscripcion,
    () => window.location.origin,
    () => ""
  );
  const [copiado, setCopiado] = React.useState(false);
  const [state, action, pendiente] = React.useActionState<AjustesAgenciaState, FormData>(actualizarAjustesAgencia, {});
  const liga = `${origen}/login?agencia=${slug}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(liga);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: la liga queda visible para copiarla a mano.
    }
  }

  return (
    <Card>
      <form action={action}>
        <CardHeader>
          <CardTitle className="text-base">Acceso y cartera</CardTitle>
          <CardDescription>Cómo entra tu equipo y qué parte de la cartera ve cada ejecutivo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="ajuste-slug" className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" /> Liga de acceso con tu marca
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">…/login?agencia=</span>
              <Input
                id="ajuste-slug"
                name="slug"
                value={valorSlug}
                onChange={(e) => setValorSlug(normalizarSlug(e.target.value))}
                className="w-56 font-mono"
                maxLength={60}
                aria-invalid={Boolean(state.errores?.slug)}
              />
            </div>
            {state.errores?.slug ? (
              <p className="text-xs text-destructive">{state.errores.slug}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Comparte esta liga con tu equipo: el inicio de sesión muestra tu logo, tu nombre y tu color.
              </p>
            )}
            {origen && (
              <div className="flex max-w-full items-center gap-2 rounded-md border bg-background/60 px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-xs">{liga}</code>
                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={copiar}>
                  {copiado ? <Check /> : <Copy />} {copiado ? "Copiada" : "Copiar"}
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="ajuste-cartera" className="flex items-center gap-2">
                <Users className="size-4 text-primary" /> Cada ejecutivo ve solo su cartera
              </Label>
              <p className="text-xs text-muted-foreground">
                Activado, un ejecutivo solo ve los clientes, pólizas, recibos y tareas que tiene asignados (y lo que
                captura queda a su nombre). Los administradores siempre ven todo. Asigna el ejecutivo de cada póliza al
                capturarla o editarla, o reasigna la cartera completa desde Usuarios.
              </p>
            </div>
            <Switch id="ajuste-cartera" checked={cartera} onCheckedChange={setCartera} />
            <input type="hidden" name="carteraPorEjecutivo" value={cartera ? "1" : "0"} />
          </div>

          <div className="flex items-center justify-end gap-3">
            {state.ok && !pendiente && (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="size-4" /> Guardado
              </span>
            )}
            {state.error && <span className="text-sm text-destructive">{state.error}</span>}
            <Button type="submit" disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar ajustes
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
