"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { iniciarSesion, type LoginState } from "@/lib/auth/actions";

export function LoginForm({ next, configurado }: { next?: string; configurado: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(iniciarSesion, {});

  return (
    <form action={action} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs">
          Correo electrónico
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@tuagencia.mx"
          defaultValue={state.email}
          required
          autoFocus
          className="h-10 bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs">
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 bg-background"
        />
      </div>

      {(state.error || !configurado) && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error ?? "La autenticación no está configurada. Contacta al administrador del sistema."}
        </p>
      )}

      <Button type="submit" className="h-10 w-full" disabled={pending || !configurado}>
        {pending ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
        {pending ? "Verificando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
