"use client";

import * as React from "react";
import Link from "next/link";
import {
  Controller,
  useForm,
  useWatch,
  type FieldErrors,
  type Resolver,
} from "react-hook-form";
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
import { Skeleton } from "@/components/ui/skeleton";
import { guardarPoliza } from "@/lib/polizas/actions";
import type { GuardarPolizaResultado } from "@/lib/polizas/guardar";
import { extraerPolizaVigor } from "@/lib/polizas/polizaParser";
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

type FormValues = {
  ramo: Ramo;
  generales: Valores;
  // Se conservan los valores de cada ramo para no perder captura al cambiar de producto.
  especificos: Record<Ramo, Valores>;
};

const iconosRamo: Record<Ramo, LucideIcon> = {
  autos: Car,
  gastos_medicos: HeartPulse,
  vida: ShieldCheck,
  empresarial: Briefcase,
};

// Los datos generales se agrupan en dos bloques; el orden de cada lista es el de pantalla.
const CAMPOS_POLIZA = [
  "aseguradora",
  "formaPago",
  "numeroImpreso",
  "polizaVigor",
  "vigenciaInicio",
  "vigenciaFin",
  "primaTotal",
];
const NOMBRES_GENERALES = new Set(camposGenerales.map((c) => c.name));

function valoresIniciales(inicial?: PolizaFormInicial): FormValues {
  const especificos: Record<Ramo, Valores> = {
    autos: {},
    gastos_medicos: {},
    vida: {},
    empresarial: {},
  };
  if (inicial?.ramo && inicial.especificos) especificos[inicial.ramo] = { ...inicial.especificos };
  return {
    ramo: inicial?.ramo ?? "autos",
    generales: { ...inicial?.generales },
    especificos,
  };
}

/** Ruta del campo dentro del formulario para un error plano de `validarPoliza`. */
function rutaCampo(nombre: string, ramo: Ramo) {
  return NOMBRES_GENERALES.has(nombre)
    ? (`generales.${nombre}` as const)
    : (`especificos.${ramo}.${nombre}` as const);
}

export function PolizaForm({
  inicial,
  aseguradoras,
  extrayendo = false,
}: {
  inicial?: PolizaFormInicial;
  aseguradoras: Opcion[];
  /** El OCR está leyendo un documento; el formulario se reemplaza por un skeleton. */
  extrayendo?: boolean;
}) {
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null);
  const [exito, setExito] = React.useState<Exito | null>(null);
  // Si el usuario corrige a mano la póliza vigor, deja de recalcularse desde el número impreso.
  const [vigorManual, setVigorManual] = React.useState(false);

  // La validación es la misma que aplica la Server Action (lib/polizas/validacion.ts).
  const resolver = React.useCallback<Resolver<FormValues>>(
    async (values) => {
      const errores = validarPoliza(
        values.ramo,
        values.generales,
        values.especificos[values.ramo],
        aseguradoras.map((a) => a.value)
      );
      if (Object.keys(errores).length === 0) return { values, errors: {} };

      const errors: Record<string, Record<string, unknown>> = { generales: {}, especificos: {} };
      const porRamo: Record<string, unknown> = {};
      for (const [nombre, message] of Object.entries(errores)) {
        const destino = NOMBRES_GENERALES.has(nombre) ? errors.generales : porRamo;
        destino[nombre] = { type: "validate", message };
      }
      errors.especificos[values.ramo] = porRamo;
      return { values: {}, errors: errors as FieldErrors<FormValues> };
    },
    [aseguradoras]
  );

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    clearErrors,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<FormValues>({ defaultValues: valoresIniciales(inicial), resolver });

  const ramo = useWatch({ control, name: "ramo" });
  const secciones = seccionesPorRamo[ramo];
  const RamoIcon = iconosRamo[ramo];

  const generalesDefs = React.useMemo(
    () =>
      camposGenerales.map((c) => (c.name === "aseguradora" ? { ...c, options: aseguradoras } : c)),
    [aseguradoras]
  );
  const camposPoliza = CAMPOS_POLIZA.map((n) => generalesDefs.find((c) => c.name === n)!);
  const camposContratante = generalesDefs.filter((c) => !CAMPOS_POLIZA.includes(c.name));

  function limpiarAvisos() {
    setErrorGeneral(null);
    setExito(null);
  }

  function actualizarVigor(numeroImpreso: string) {
    setValue("generales.polizaVigor", extraerPolizaVigor(numeroImpreso), {
      shouldValidate: submitCount > 0,
    });
  }

  function reiniciar() {
    reset(valoresIniciales());
    setVigorManual(false);
    limpiarAvisos();
  }

  const onSubmit = handleSubmit(async (values) => {
    limpiarAvisos();
    const res = await guardarPoliza({
      ramo: values.ramo,
      generales: values.generales,
      especificos: values.especificos[values.ramo],
    });
    if (res.ok) {
      setExito(res);
      return;
    }
    setErrorGeneral(res.error ?? null);
    for (const [nombre, message] of Object.entries(res.errores ?? ({} as Errores))) {
      setError(rutaCampo(nombre, values.ramo), { type: "server", message });
    }
  });

  const bloqueado = isSubmitting || extrayendo;
  const totalErrores =
    Object.keys(errors.generales ?? {}).length +
    Object.keys(errors.especificos?.[ramo] ?? {}).length;

  function renderGeneral(campo: CampoDef) {
    const esImpreso = campo.name === "numeroImpreso";
    const esVigor = campo.name === "polizaVigor";

    return (
      <Controller
        key={campo.name}
        name={`generales.${campo.name}`}
        control={control}
        render={({ field, fieldState }) => (
          <Campo
            campo={campo}
            valor={field.value ?? ""}
            error={fieldState.error?.message}
            disabled={bloqueado}
            inputRef={field.ref}
            onBlur={field.onBlur}
            destacado={esVigor}
            ayuda={
              esVigor && vigorManual ? (
                <button
                  type="button"
                  onClick={() => {
                    setVigorManual(false);
                    actualizarVigor(getValues("generales.numeroImpreso") ?? "");
                  }}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <RotateCcw className="size-3" /> Recalcular desde el número impreso
                </button>
              ) : undefined
            }
            onChange={(v) => {
              field.onChange(v);
              limpiarAvisos();
              if (esImpreso && !vigorManual) actualizarVigor(v);
              if (esVigor) setVigorManual(true);
            }}
          />
        )}
      />
    );
  }

  return (
    <Card className="gap-0 py-0">
      <form onSubmit={onSubmit} noValidate>
        <CardHeader className="border-b px-6 py-5 [.border-b]:pb-5">
          <CardTitle className="text-base">Nueva póliza</CardTitle>
          <CardDescription>
            Revisa los datos extraídos antes de guardar; todos los campos son editables.
          </CardDescription>
        </CardHeader>

        {extrayendo ? (
          <CardContent className="px-6 py-6">
            <ExtrayendoSkeleton />
          </CardContent>
        ) : (
          <fieldset disabled={isSubmitting} className="contents">
            <CardContent className="space-y-8 px-6 py-6">
              <div className="grid gap-4 rounded-lg border bg-background/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="ramo">Ramo / Producto</Label>
                  <Controller
                    name="ramo"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          clearErrors();
                          limpiarAvisos();
                        }}
                        disabled={bloqueado}
                      >
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
                    )}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex size-8 items-center justify-center rounded-md border bg-card text-primary">
                    <RamoIcon className="size-4" />
                  </div>
                  {secciones.reduce((n, s) => n + s.campos.length, 0)} campos específicos de{" "}
                  {ramoLabels[ramo]}
                </div>
              </div>

              <FormSection titulo="Póliza">{camposPoliza.map(renderGeneral)}</FormSection>

              <FormSection titulo="Contratante">{camposContratante.map(renderGeneral)}</FormSection>

              {secciones.map((seccion) => (
                <FormSection
                  key={`${ramo}-${seccion.titulo}`}
                  titulo={seccion.titulo}
                  badge={ramoLabels[ramo]}
                >
                  {seccion.campos.map((campo) => (
                    <Controller
                      key={`${ramo}-${campo.name}`}
                      name={`especificos.${ramo}.${campo.name}`}
                      control={control}
                      render={({ field, fieldState }) => (
                        <Campo
                          campo={campo}
                          valor={field.value ?? ""}
                          error={fieldState.error?.message}
                          disabled={bloqueado}
                          inputRef={field.ref}
                          onBlur={field.onBlur}
                          onChange={(v) => {
                            field.onChange(v);
                            limpiarAvisos();
                          }}
                        />
                      )}
                    />
                  ))}
                </FormSection>
              ))}
            </CardContent>
          </fieldset>
        )}

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
          <Button type="button" variant="ghost" onClick={reiniciar} disabled={bloqueado}>
            <RotateCcw /> Limpiar
          </Button>
          <Button type="submit" disabled={bloqueado || exito !== null}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {isSubmitting ? "Guardando…" : "Guardar póliza"}
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

function ExtrayendoSkeleton() {
  return (
    <div className="space-y-6" aria-live="polite" aria-busy="true">
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <Loader2 className="size-4 animate-spin" />
        Extrayendo datos con IA...
      </p>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

const tipoInput: Partial<Record<CampoDef["type"], string>> = {
  date: "date",
  email: "email",
  tel: "tel",
};

const CAMPOS_CLAVE = new Set(["numeroImpreso", "polizaVigor"]);

function Campo({
  campo,
  valor,
  error,
  disabled,
  destacado,
  ayuda,
  inputRef,
  onBlur,
  onChange,
}: {
  campo: CampoDef;
  valor: string;
  error?: string;
  disabled?: boolean;
  /** Resalta el campo con el acento corporativo. */
  destacado?: boolean;
  /** Reemplaza al `hint` del campo. */
  ayuda?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement & HTMLButtonElement>;
  onBlur?: () => void;
  onChange: (value: string) => void;
}) {
  const id = `campo-${campo.name}`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);
  const pista = ayuda ?? campo.hint;

  let control: React.ReactNode;
  if (campo.type === "select") {
    const opciones = (campo.options ?? []).map(normalizarOpcion);
    control = (
      <Select value={valor} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          ref={inputRef}
          onBlur={onBlur}
          aria-invalid={invalid}
          aria-describedby={error ? errorId : undefined}
          className="w-full"
        >
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
          ref={inputRef}
          type={tipoInput[campo.type] ?? "text"}
          inputMode={numerico ? "decimal" : campo.type === "tel" ? "tel" : undefined}
          placeholder={campo.placeholder}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          autoComplete={CAMPOS_CLAVE.has(campo.name) ? "off" : undefined}
          aria-invalid={invalid}
          aria-describedby={error ? errorId : pista ? `${id}-hint` : undefined}
          className={cn(
            numerico && "tabular-nums",
            campo.type === "currency" && "pl-7",
            campo.type === "percent" && "pr-8",
            (campo.name === "rfc" || campo.name === "rfcCliente") && "uppercase",
            CAMPOS_CLAVE.has(campo.name) && "font-mono uppercase",
            destacado && "border-primary/40"
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
        pista && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {pista}
          </p>
        )
      )}
    </div>
  );
}
