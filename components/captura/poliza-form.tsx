"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Car,
  CheckCircle2,
  HeartPulse,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { guardarPoliza } from "@/lib/polizas/actions";
import type { GuardarPolizaResultado } from "@/lib/polizas/guardar";
import {
  camposGenerales,
  normalizarOpcion,
  RAMOS,
  ramoLabels,
  seccionesPorRamo,
  type CampoDef,
  type Opcion,
  type Ramo,
} from "@/lib/polizas/ramos";
import { validarPoliza, type Errores, type Valores } from "@/lib/polizas/validacion";
import { cn } from "@/lib/utils";

export type PolizaFormInicial = {
  ramo?: Ramo;
  generales?: Valores;
  /** Campos específicos del ramo inicial. */
  especificos?: Valores;
};

type Exito = Extract<GuardarPolizaResultado, { ok: true }>;

const iconosRamo: Record<Ramo, LucideIcon> = {
  autos: Car,
  gastos_medicos: HeartPulse,
  vida: ShieldCheck,
  empresarial: Briefcase,
};

const vacioPorRamo = (): Record<Ramo, Valores> => ({
  autos: {},
  gastos_medicos: {},
  vida: {},
  empresarial: {},
});

function sinClave(obj: Errores, clave: string) {
  if (!(clave in obj)) return obj;
  const copia = { ...obj };
  delete copia[clave];
  return copia;
}

export function PolizaForm({
  inicial,
  aseguradoras,
}: {
  inicial?: PolizaFormInicial;
  aseguradoras: Opcion[];
}) {
  const [ramo, setRamo] = React.useState<Ramo>(inicial?.ramo ?? "autos");
  const [generales, setGenerales] = React.useState<Valores>(inicial?.generales ?? {});
  // Se conservan los valores de cada ramo para no perder captura al cambiar de producto.
  const [especificos, setEspecificos] = React.useState(() => {
    const base = vacioPorRamo();
    if (inicial?.ramo && inicial.especificos) base[inicial.ramo] = { ...inicial.especificos };
    return base;
  });
  const [errores, setErrores] = React.useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null);
  const [exito, setExito] = React.useState<Exito | null>(null);
  const [guardando, startGuardado] = React.useTransition();

  const generalesDefs = React.useMemo(
    () =>
      camposGenerales.map((c) => (c.name === "aseguradora" ? { ...c, options: aseguradoras } : c)),
    [aseguradoras]
  );
  const secciones = seccionesPorRamo[ramo];
  const RamoIcon = iconosRamo[ramo];

  function limpiarEstado(name?: string) {
    if (name) setErrores((prev) => sinClave(prev, name));
    setErrorGeneral(null);
    setExito(null);
  }

  function setGeneral(name: string, value: string) {
    setGenerales((prev) => ({ ...prev, [name]: value }));
    limpiarEstado(name);
  }

  function setEspecifico(name: string, value: string) {
    setEspecificos((prev) => ({ ...prev, [ramo]: { ...prev[ramo], [name]: value } }));
    limpiarEstado(name);
  }

  function cambiarRamo(nuevo: string) {
    setRamo(nuevo as Ramo);
    setErrores({});
    limpiarEstado();
  }

  function reiniciar() {
    setGenerales({});
    setEspecificos(vacioPorRamo());
    setErrores({});
    limpiarEstado();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const locales = validarPoliza(
      ramo,
      generales,
      especificos[ramo],
      aseguradoras.map((a) => a.value)
    );
    setErrores(locales);
    setErrorGeneral(null);
    setExito(null);
    if (Object.keys(locales).length > 0) return;

    startGuardado(async () => {
      const res = await guardarPoliza({ ramo, generales, especificos: especificos[ramo] });
      if (res.ok) {
        setExito(res);
      } else {
        setErrores(res.errores ?? {});
        setErrorGeneral(res.error ?? null);
      }
    });
  }

  const totalErrores = Object.keys(errores).length;

  return (
    <Card className="gap-0 py-0">
      <form onSubmit={onSubmit} noValidate>
        <CardHeader className="border-b px-6 py-5 [.border-b]:pb-5">
          <CardTitle className="text-base">Nueva póliza</CardTitle>
          <CardDescription>
            Los campos del formulario se adaptan al ramo seleccionado.
          </CardDescription>
        </CardHeader>

        <fieldset disabled={guardando} className="contents">
          <CardContent className="space-y-8 px-6 py-6">
            <div className="grid gap-4 rounded-lg border bg-background/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="ramo">Ramo / Producto</Label>
                <Select value={ramo} onValueChange={cambiarRamo} disabled={guardando}>
                  <SelectTrigger id="ramo" className="w-full bg-card sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RAMOS.map((r) => {
                      const Icon = iconosRamo[r];
                      return (
                        <SelectItem key={r} value={r}>
                          <Icon /> {ramoLabels[r]}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex size-8 items-center justify-center rounded-md border bg-card text-primary">
                  <RamoIcon className="size-4" />
                </div>
                {secciones.reduce((n, s) => n + s.campos.length, 0)} campos específicos de{" "}
                {ramoLabels[ramo]}
              </div>
            </div>

            <FormSection titulo="Datos generales">
              {generalesDefs.map((campo) => (
                <Campo
                  key={campo.name}
                  campo={campo}
                  valor={generales[campo.name] ?? ""}
                  error={errores[campo.name]}
                  disabled={guardando}
                  onChange={(v) => setGeneral(campo.name, v)}
                />
              ))}
            </FormSection>

            {secciones.map((seccion) => (
              <FormSection key={`${ramo}-${seccion.titulo}`} titulo={seccion.titulo} badge={ramoLabels[ramo]}>
                {seccion.campos.map((campo) => (
                  <Campo
                    key={`${ramo}-${campo.name}`}
                    campo={campo}
                    valor={especificos[ramo][campo.name] ?? ""}
                    error={errores[campo.name]}
                    disabled={guardando}
                    onChange={(v) => setEspecifico(campo.name, v)}
                  />
                ))}
              </FormSection>
            ))}
          </CardContent>
        </fieldset>

        {exito && (
          <div className="mx-6 mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm">
            <CheckCircle2 className="size-5 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-success">
                Póliza {exito.poliza.numero} guardada con {exito.recibos}{" "}
                {exito.recibos === 1 ? "recibo pendiente" : "recibos pendientes"}.
              </p>
              <p className="text-xs text-muted-foreground">
                {exito.cliente.nuevo ? "Cliente nuevo registrado" : "Asignada al cliente existente"}:{" "}
                {exito.cliente.nombre}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/polizas">
                Ver pólizas <ArrowRight />
              </Link>
            </Button>
            <Button type="button" size="sm" onClick={reiniciar}>
              Capturar otra
            </Button>
          </div>
        )}

        <CardFooter className="flex flex-wrap items-center gap-3 border-t px-6 py-4 [.border-t]:pt-4">
          <div className="mr-auto text-sm" aria-live="polite">
            {errorGeneral && (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="size-4" /> {errorGeneral}
              </span>
            )}
            {!errorGeneral && totalErrores > 0 && (
              <span className="text-destructive">
                Revisa {totalErrores} {totalErrores === 1 ? "campo marcado" : "campos marcados"}.
              </span>
            )}
          </div>
          <Button type="button" variant="ghost" onClick={reiniciar} disabled={guardando}>
            <RotateCcw /> Limpiar
          </Button>
          <Button type="submit" disabled={guardando || exito !== null}>
            {guardando ? <Loader2 className="animate-spin" /> : <Save />}
            {guardando ? "Guardando…" : "Guardar póliza"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function FormSection({
  titulo,
  badge,
  children,
}: {
  titulo: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {titulo}
        </h3>
        {badge && (
          <span className="rounded border border-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {badge}
          </span>
        )}
        <Separator className="flex-1" />
      </div>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const tipoInput: Partial<Record<CampoDef["type"], string>> = {
  date: "date",
  email: "email",
  tel: "tel",
};

function Campo({
  campo,
  valor,
  error,
  disabled,
  onChange,
}: {
  campo: CampoDef;
  valor: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = `campo-${campo.name}`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);

  let control: React.ReactNode;
  if (campo.type === "select") {
    const opciones = (campo.options ?? []).map(normalizarOpcion);
    control = (
      <Select value={valor} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-invalid={invalid} aria-describedby={error ? errorId : undefined} className="w-full">
          <SelectValue placeholder={opciones.length ? "Selecciona…" : "Sin opciones disponibles"} />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else {
    const numerico = campo.type === "number" || campo.type === "currency" || campo.type === "percent";
    control = (
      <div className="relative">
        {campo.type === "currency" && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
        )}
        <Input
          id={id}
          type={tipoInput[campo.type] ?? "text"}
          inputMode={numerico ? "decimal" : campo.type === "tel" ? "tel" : undefined}
          placeholder={campo.placeholder}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={error ? errorId : campo.hint ? `${id}-hint` : undefined}
          className={cn(
            numerico && "tabular-nums",
            campo.type === "currency" && "pl-7",
            campo.type === "percent" && "pr-8",
            (campo.name === "rfc" || campo.name === "rfcCliente") && "uppercase"
          )}
        />
        {campo.type === "percent" && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", campo.wide && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-xs">
        {campo.label}
        {campo.required && <span className="text-primary">*</span>}
      </Label>
      {control}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        campo.hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {campo.hint}
          </p>
        )
      )}
    </div>
  );
}
