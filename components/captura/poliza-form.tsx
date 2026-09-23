"use client";

import * as React from "react";
import {
  Briefcase,
  Car,
  CheckCircle2,
  HeartPulse,
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
import {
  camposGenerales,
  RAMOS,
  ramoLabels,
  seccionesPorRamo,
  type CampoDef,
  type Ramo,
} from "@/lib/polizas/ramos";
import { cn } from "@/lib/utils";

export type Valores = Record<string, string>;

export type PolizaFormInicial = {
  ramo?: Ramo;
  generales?: Valores;
};

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

function sinClave(obj: Record<string, string>, clave: string) {
  if (!(clave in obj)) return obj;
  const copia = { ...obj };
  delete copia[clave];
  return copia;
}

function validarCampo(campo: CampoDef, valor: string | undefined): string | null {
  const v = valor?.trim() ?? "";
  if (!v) return campo.required ? "Campo obligatorio" : null;
  if (campo.type === "number" || campo.type === "currency" || campo.type === "percent") {
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) return "Ingresa un número válido";
    if (campo.type === "percent" && n > 100) return "Debe estar entre 0 y 100";
  }
  if (campo.name === "serie" && v.length !== 17) return "El VIN debe tener 17 caracteres";
  if (campo.name === "rfc" && !/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i.test(v)) return "RFC con formato inválido";
  return null;
}

function validar(ramo: Ramo, generales: Valores, especificos: Valores) {
  const errores: Record<string, string> = {};
  for (const campo of camposGenerales) {
    const e = validarCampo(campo, generales[campo.name]);
    if (e) errores[campo.name] = e;
  }
  for (const seccion of seccionesPorRamo[ramo]) {
    for (const campo of seccion.campos) {
      const e = validarCampo(campo, especificos[campo.name]);
      if (e) errores[campo.name] = e;
    }
  }
  const { vigenciaInicio, vigenciaFin } = generales;
  if (vigenciaInicio && vigenciaFin && vigenciaFin <= vigenciaInicio) {
    errores.vigenciaFin = "Debe ser posterior al inicio de vigencia";
  }
  return errores;
}

export function PolizaForm({ inicial }: { inicial?: PolizaFormInicial }) {
  const [ramo, setRamo] = React.useState<Ramo>(inicial?.ramo ?? "autos");
  const [generales, setGenerales] = React.useState<Valores>(inicial?.generales ?? {});
  // Se conservan los valores de cada ramo para no perder captura al cambiar de producto.
  const [especificos, setEspecificos] = React.useState(vacioPorRamo);
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [guardada, setGuardada] = React.useState(false);

  const secciones = seccionesPorRamo[ramo];
  const RamoIcon = iconosRamo[ramo];

  function setGeneral(name: string, value: string) {
    setGenerales((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => sinClave(prev, name));
    setGuardada(false);
  }

  function setEspecifico(name: string, value: string) {
    setEspecificos((prev) => ({ ...prev, [ramo]: { ...prev[ramo], [name]: value } }));
    setErrores((prev) => sinClave(prev, name));
    setGuardada(false);
  }

  function cambiarRamo(nuevo: string) {
    setRamo(nuevo as Ramo);
    setErrores({});
    setGuardada(false);
  }

  function reiniciar() {
    setGenerales({});
    setEspecificos(vacioPorRamo());
    setErrores({});
    setGuardada(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nuevosErrores = validar(ramo, generales, especificos[ramo]);
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) {
      setGuardada(false);
      return;
    }
    // TODO: persistir mediante Server Action cuando exista la capa de datos.
    setGuardada(true);
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

        <CardContent className="space-y-8 px-6 py-6">
          <div className="grid gap-4 rounded-lg border bg-background/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="ramo">Ramo / Producto</Label>
              <Select value={ramo} onValueChange={cambiarRamo}>
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
            {camposGenerales.map((campo) => (
              <Campo
                key={campo.name}
                campo={campo}
                valor={generales[campo.name] ?? ""}
                error={errores[campo.name]}
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
                  onChange={(v) => setEspecifico(campo.name, v)}
                />
              ))}
            </FormSection>
          ))}
        </CardContent>

        <CardFooter className="flex flex-wrap items-center gap-3 border-t px-6 py-4 [.border-t]:pt-4">
          <div className="mr-auto text-sm" aria-live="polite">
            {totalErrores > 0 && (
              <span className="text-destructive">
                Revisa {totalErrores} {totalErrores === 1 ? "campo" : "campos"} marcados.
              </span>
            )}
            {guardada && (
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-4" /> Póliza validada y lista para registrar.
              </span>
            )}
          </div>
          <Button type="button" variant="ghost" onClick={reiniciar}>
            <RotateCcw /> Limpiar
          </Button>
          <Button type="submit">
            <Save /> Guardar póliza
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

function Campo({
  campo,
  valor,
  error,
  onChange,
}: {
  campo: CampoDef;
  valor: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `campo-${campo.name}`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);

  let control: React.ReactNode;
  if (campo.type === "select") {
    control = (
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger id={id} aria-invalid={invalid} aria-describedby={error ? errorId : undefined} className="w-full">
          <SelectValue placeholder="Selecciona…" />
        </SelectTrigger>
        <SelectContent>
          {campo.options?.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
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
          type={campo.type === "date" ? "date" : "text"}
          inputMode={numerico ? "decimal" : undefined}
          placeholder={campo.placeholder}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            numerico && "tabular-nums",
            campo.type === "currency" && "pl-7",
            campo.type === "percent" && "pr-8"
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
        campo.hint && <p className="text-xs text-muted-foreground">{campo.hint}</p>
      )}
    </div>
  );
}
