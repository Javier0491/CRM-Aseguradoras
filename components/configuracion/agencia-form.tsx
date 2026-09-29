"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ImageUp, Loader2, Moon, Sun, Trash2 } from "lucide-react";

import { LogoAgencia } from "@/components/layout/logo-agencia";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actualizarAgencia, type AgenciaFormState } from "@/lib/agencias/actions";
import {
  COLOR_MARCA_PREDETERMINADO,
  esTema,
  FONDO_TEMA,
  LOGO_FORMATOS,
  LOGO_MAX_BYTES,
  TEMA_PREDETERMINADO,
  TEMAS,
  type Tema,
} from "@/lib/agencias/marca";
import { colorTextoSobre, contraste, normalizarHex } from "@/lib/color";
import { cn } from "@/lib/utils";

/** Colores sugeridos; cualquier otro se elige con el selector o escribiendo el hex. */
const SUGERIDOS = ["#C5A059", "#3B82F6", "#10B981", "#EF4444", "#A855F7", "#F97316", "#14B8A6", "#EAB308"];

/** Debajo de 3:1 el color de marca, usado como texto e íconos, cuesta leerlo sobre el fondo. */
const CONTRASTE_MINIMO = 3;

type Agencia = { nombre: string; logoUrl: string | null; colorHex: string | null; tema: string };

const ICONO_TEMA = { dark: Moon, light: Sun } satisfies Record<Tema, unknown>;

export function AgenciaForm({ agencia }: { agencia: Agencia }) {
  const [nombre, setNombre] = React.useState(agencia.nombre);
  const [color, setColor] = React.useState(normalizarHex(agencia.colorHex) ?? COLOR_MARCA_PREDETERMINADO);
  // Lo que se escribe en el campo hex; solo se aplica al color cuando es válido.
  const [colorTexto, setColorTexto] = React.useState(color);
  const [tema, setTema] = React.useState<Tema>(esTema(agencia.tema) ? agencia.tema : TEMA_PREDETERMINADO);
  const [archivo, setArchivo] = React.useState<{ file: File; url: string } | null>(null);
  const [quitarLogo, setQuitarLogo] = React.useState(false);
  const [errorArchivo, setErrorArchivo] = React.useState<string | null>(null);
  const inputArchivo = React.useRef<HTMLInputElement>(null);
  // El archivo se adjunta desde el estado, no desde el <input>: React limpia los campos no
  // controlados al terminar cada envío, también cuando el servidor responde con un error.
  const archivoRef = React.useRef<File | null>(null);

  const [state, action, pendiente] = React.useActionState(
    async (prev: AgenciaFormState, formData: FormData) => {
      if (archivoRef.current) formData.set("logo", archivoRef.current);
      const r = await actualizarAgencia(prev, formData);
      if (r.ok) {
        // El logo guardado ya llega en las props (el layout se revalida).
        archivoRef.current = null;
        setArchivo(null);
        setQuitarLogo(false);
      }
      return r;
    },
    {}
  );

  React.useEffect(() => () => {
    if (archivo) URL.revokeObjectURL(archivo.url);
  }, [archivo]);

  function elegirColor(valor: string) {
    const hex = normalizarHex(valor);
    setColorTexto(valor);
    if (hex) setColor(hex);
  }

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setErrorArchivo(null);
    if (!file) return;
    // Mismas reglas que el servidor (que igual las vuelve a revisar).
    if (!(file.type in LOGO_FORMATOS)) {
      setErrorArchivo("Usa una imagen PNG, JPG o WEBP.");
    } else if (file.size > LOGO_MAX_BYTES) {
      setErrorArchivo(`El logo debe pesar como máximo ${LOGO_MAX_BYTES / 1024} KB.`);
    } else {
      archivoRef.current = file;
      setArchivo({ file, url: URL.createObjectURL(file) });
      setQuitarLogo(false);
      return;
    }
    e.target.value = "";
  }

  function quitar() {
    archivoRef.current = null;
    setArchivo(null);
    setQuitarLogo(true);
    if (inputArchivo.current) inputArchivo.current.value = "";
  }

  const logoVista = archivo?.url ?? (quitarLogo ? null : agencia.logoUrl);
  const nombreVista = nombre.trim() || agencia.nombre;
  const poco = contraste(color, FONDO_TEMA[tema]) < CONTRASTE_MINIMO;
  // Vista previa: el color elegido solo dentro de este recuadro, sin tocar el resto de la página.
  const estiloVista = {
    "--primary": color,
    "--primary-foreground": colorTextoSobre(color),
  } as React.CSSProperties;

  return (
    <form action={action} className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidad de la agencia</CardTitle>
          <CardDescription>Se aplica a todo el equipo de tu agencia en cuanto guardas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              required
              aria-invalid={Boolean(state.errores?.nombre)}
            />
            {state.errores?.nombre && <p className="text-xs text-destructive">{state.errores.nombre}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-lg border bg-sidebar p-2">
                <LogoAgencia nombre={nombreVista} logoUrl={logoVista} className="size-12" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inputArchivo.current?.click()}>
                  <ImageUp /> {logoVista ? "Cambiar logo" : "Subir logo"}
                </Button>
                {logoVista && (
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={quitar}>
                    <Trash2 /> Quitar
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={inputArchivo}
              id="logo"
              type="file"
              accept={Object.keys(LOGO_FORMATOS).join(",")}
              className="sr-only"
              onChange={elegirArchivo}
            />
            <input type="hidden" name="quitarLogo" value={quitarLogo ? "1" : ""} />
            <p className="text-xs text-muted-foreground">
              PNG, JPG o WEBP de hasta {LOGO_MAX_BYTES / 1024} KB. Se muestra a 32 px: funciona mejor un ícono o
              monograma cuadrado con fondo transparente. Sin logo se usan las iniciales del nombre.
            </p>
            {(errorArchivo ?? state.errores?.logo) && (
              <p className="text-xs text-destructive">{errorArchivo ?? state.errores?.logo}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="colorHex">Color de marca</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                aria-label="Selector de color"
                value={color}
                onChange={(e) => elegirColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                id="colorHex"
                name="colorHex"
                value={colorTexto}
                onChange={(e) => elegirColor(e.target.value)}
                onBlur={() => setColorTexto(color)}
                maxLength={7}
                spellCheck={false}
                className="w-28 font-mono uppercase"
                aria-invalid={Boolean(state.errores?.colorHex)}
              />
              <div className="flex flex-wrap gap-1.5">
                {SUGERIDOS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Usar ${c}`}
                    title={c}
                    onClick={() => elegirColor(c)}
                    className={cn(
                      "size-6 rounded-full border border-white/10 transition-transform hover:scale-110",
                      c === color && "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {state.errores?.colorHex && <p className="text-xs text-destructive">{state.errores.colorHex}</p>}
            {poco && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3.5 shrink-0" /> Este color tiene poco contraste con el fondo{" "}
                {tema === "dark" ? "oscuro" : "claro"}: textos e íconos de marca costarán trabajo leerse. Prueba un
                tono más {tema === "dark" ? "claro" : "oscuro"}.
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Fondo de la interfaz</legend>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              {TEMAS.map((t) => {
                const Icono = ICONO_TEMA[t.value];
                const elegido = tema === t.value;
                return (
                  <label
                    key={t.value}
                    className={cn(
                      "cursor-pointer rounded-lg border p-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      elegido ? "border-primary ring-1 ring-primary" : "hover:border-muted-foreground/40"
                    )}
                  >
                    <input
                      type="radio"
                      name="tema"
                      value={t.value}
                      checked={elegido}
                      onChange={() => setTema(t.value)}
                      className="sr-only"
                    />
                    {/* Miniatura con la paleta real del modo (clases .dark/.light de globals.css). */}
                    <div
                      style={estiloVista}
                      className={cn(t.value, "flex h-16 overflow-hidden rounded-md border bg-background")}
                    >
                      <div className="w-1/3 space-y-1 border-r bg-sidebar p-1.5">
                        <div className="h-1.5 w-3/4 rounded-full bg-primary" />
                        <div className="h-1.5 w-full rounded-full bg-muted" />
                        <div className="h-1.5 w-2/3 rounded-full bg-muted" />
                      </div>
                      <div className="flex-1 space-y-1.5 p-1.5">
                        <div className="h-5 rounded border bg-card" />
                        <div className="h-1.5 w-1/2 rounded-full bg-muted-foreground/40" />
                      </div>
                    </div>
                    <span className="mt-2 flex items-center gap-1.5 text-sm">
                      <Icono className="size-3.5 text-muted-foreground" /> {t.label}
                    </span>
                  </label>
                );
              })}
            </div>
            {state.errores?.tema && <p className="text-xs text-destructive">{state.errores.tema}</p>}
          </fieldset>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-20">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Vista previa</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Con la clase del tema elegido, la vista previa usa su paleta aunque la página siga en la otra. */}
            <div style={estiloVista} className={cn(tema, "space-y-3 rounded-lg border bg-sidebar p-3 text-foreground")}>
              <div className="flex items-center gap-2 border-b pb-3">
                <LogoAgencia nombre={nombreVista} logoUrl={logoVista} />
                <div className="grid leading-tight">
                  <span className="truncate text-sm font-semibold tracking-[0.18em] uppercase">{nombreVista}</span>
                  <span className="text-[11px] text-muted-foreground">Broker de Seguros</span>
                </div>
              </div>
              <div className="rounded-md bg-sidebar-accent px-2 py-1.5 text-sm text-primary">Dashboard</div>
              <div className="px-2 text-sm text-sidebar-foreground">Pólizas</div>
              <div className="flex items-center gap-2 pt-1">
                <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                  Capturar póliza
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full w-2/3 rounded-full bg-primary" />
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {state.ok && !pendiente && (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="size-3.5" /> Cambios guardados
            </span>
          )}
          {state.error && <span className="text-xs text-destructive">{state.error}</span>}
          <Button type="submit" disabled={pendiente || Boolean(errorArchivo)}>
            {pendiente && <Loader2 className="animate-spin" />} Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  );
}
