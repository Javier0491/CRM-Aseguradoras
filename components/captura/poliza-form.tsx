"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Controller,
  useForm,
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type UseFormSetValue,
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
  House,
  Loader2,
  RotateCcw,
  Save,
  Scale,
  Trash2,
  UserPlus,
  Shapes,
  ShieldCheck,
  Stethoscope,
  Users,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArchivoInput } from "@/components/archivos/archivo-input";
import type { VincularArchivoResultado } from "@/lib/archivos/actions";
import { ARCHIVOS, TIPOS_ARCHIVO, validarArchivo, type TipoArchivo } from "@/lib/archivos/config";
import { esArchivoIlegible, MENSAJE_ARCHIVO_PERDIDO } from "@/lib/archivos/memoria";
import { subirArchivo } from "@/lib/archivos/subir";
import { hoyISO } from "@/lib/format";
import { editarPoliza, guardarPoliza } from "@/lib/polizas/actions";
import type { GuardarPolizaResultado } from "@/lib/polizas/guardar";
import {
  aseguradoVacio,
  edadAl,
  fechaNacimientoDeRfc,
  PARENTESCOS,
  parentescoLabels,
  SEXOS,
  validarAsegurados,
  type AseguradoValores,
} from "@/lib/polizas/asegurados";
import { extraerPolizaVigor } from "@/lib/polizas/polizaParser";
import { redesDeAseguradora } from "@/lib/polizas/redes-medicas";
import {
  camposGenerales,
  camposSumaAsegurada,
  normalizarOpcion,
  RAMOS,
  RAMOS_CON_CENSO,
  ramoLabels,
  seccionesPorRamo,
  SUMA_ASEGURADA,
  TEXTO_SUMA_ILIMITADA,
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
  asegurados?: AseguradoValores[];
  /** La IA detectó la suma asegurada como "Sin límite". */
  sumaAseguradaIlimitada?: boolean;
};

/**
 * Para qué se usa el formulario:
 * - captura: póliza nueva.
 * - renovacion: póliza nueva que renueva `anterior`; conserva su póliza vigor (la cadena).
 * - edicion: corrige una póliza guardada; `bloqueados` son campos que no se pueden cambiar
 *   (el calendario de recibos cuando ya hay recibos cobrados).
 */
export type ModoPoliza =
  | { tipo: "captura" }
  | { tipo: "renovacion"; anterior: { id: string; numero: string } }
  | { tipo: "edicion"; polizaId: string; numero: string; bloqueados: readonly string[] };

/** Acciones del formulario disponibles para el contenedor (vía `ref`). */
export type PolizaFormHandle = {
  /**
   * Complementa la captura con los datos de un segundo documento (formato de negociación u
   * orden de emisión). Solo llena campos vacíos, salvo "Condiciones del Subgrupo", que se
   * toma siempre del documento porque es su fuente.
   */
  aplicarComplemento: (datos: PolizaFormInicial) => void;
};

const SUBIENDO: Record<TipoArchivo, string> = {
  caratula: "carátula",
  negociacion: "formato de negociación",
  expediente: "expediente",
};

/** Campos del complemento que reemplazan lo capturado en lugar de solo llenar vacíos. */
const CAMPOS_DEL_COMPLEMENTO = new Set(["condicionesSubgrupo"]);

type Exito = Extract<GuardarPolizaResultado, { ok: true }> & {
  /** Resultado de la subida de cada archivo adjuntado. */
  archivos: Partial<Record<TipoArchivo, VincularArchivoResultado>>;
};

type FormValues = {
  ramo: Ramo;
  generales: Valores;
  // Se conservan los valores de cada ramo para no perder captura al cambiar de producto.
  especificos: Record<Ramo, Valores>;
  asegurados: AseguradoValores[];
  /**
   * Suma asegurada "Sin límite". Aplica solo a los ramos con suma asegurada (SUMA_ASEGURADA):
   * su cantidad y unidad se vacían, se deshabilitan y no se validan.
   */
  sumaIlimitada: boolean;
  /** Expediente de respaldo; se sube a Storage después de guardar la póliza. */
  expediente: File | null;
};

/** La bandera solo cuenta en ramos que tienen suma asegurada. */
const esSumaIlimitada = (values: Pick<FormValues, "ramo" | "sumaIlimitada">) =>
  values.sumaIlimitada && camposSumaAsegurada(values.ramo).length > 0;

const iconosRamo: Record<Ramo, LucideIcon> = {
  autos: Car,
  gmm_individual: HeartPulse,
  gmm_colectivo: Stethoscope,
  vida_individual: ShieldCheck,
  vida_grupo: Users,
  danos: Briefcase,
  rc_profesional: Scale,
  hogar: House,
  otros: Shapes,
};

// Los datos generales se agrupan en dos bloques; el orden de cada lista es el de pantalla.
const CAMPOS_POLIZA = [
  "aseguradora",
  "formaPago",
  "comisionPersonalizadaPct",
  "numeroImpreso",
  "polizaVigor",
  "vigenciaInicio",
  "vigenciaFin",
  "primaTotal",
  "primaNeta",
];
const NOMBRES_GENERALES = new Set(camposGenerales.map((c) => c.name));

// Todos los campos con "" explícito: `reset()` no vacía un campo cuyo valor nuevo es
// undefined (conserva el anterior), así que "Limpiar" necesita cada clave presente.
const vacios = (campos: CampoDef[]): Valores => Object.fromEntries(campos.map((c) => [c.name, ""]));

function valoresIniciales(inicial?: PolizaFormInicial): FormValues {
  const especificos = Object.fromEntries(
    RAMOS.map((r) => [r, vacios(seccionesPorRamo[r].flatMap((s) => s.campos))])
  ) as Record<Ramo, Valores>;
  if (inicial?.ramo && inicial.especificos) {
    especificos[inicial.ramo] = { ...especificos[inicial.ramo], ...inicial.especificos };
  }
  if (inicial?.ramo && inicial.sumaAseguradaIlimitada) {
    for (const nombre of camposSumaAsegurada(inicial.ramo)) especificos[inicial.ramo][nombre] = "";
  }
  return {
    ramo: inicial?.ramo ?? "autos",
    generales: { ...vacios(camposGenerales), ...inicial?.generales },
    especificos,
    asegurados: (inicial?.asegurados ?? []).map((a) => ({ ...aseguradoVacio(), ...a })),
    sumaIlimitada: inicial?.sumaAseguradaIlimitada ?? false,
    expediente: null,
  };
}

/** Ruta del campo dentro del formulario para un error plano de la validación. */
function rutaCampo(nombre: string, ramo: Ramo) {
  // Los errores de asegurados ya vienen con su ruta ("asegurados.2.nombre").
  if (nombre.startsWith("asegurados.")) return nombre as `asegurados.${number}.${keyof AseguradoValores}`;
  return NOMBRES_GENERALES.has(nombre)
    ? (`generales.${nombre}` as const)
    : (`especificos.${ramo}.${nombre}` as const);
}

export function PolizaForm({
  inicial,
  aseguradoras,
  verComisiones,
  extrayendo = false,
  leidaConIa = false,
  caratula = null,
  negociacion = null,
  onReiniciar,
  onRamoChange,
  modo = { tipo: "captura" },
  ref,
}: {
  modo?: ModoPoliza;
  /** Avisa al contenedor el ramo seleccionado (p. ej. para mostrar el segundo documento). */
  onRamoChange?: (ramo: Ramo) => void;
  ref?: React.Ref<PolizaFormHandle>;
  inicial?: PolizaFormInicial;
  /** `usaPolizaVigor: false` (p. ej. Quálitas): no se pide la póliza vigor. */
  aseguradoras: (Opcion & { usaPolizaVigor?: boolean })[];
  /** false para ejecutivos: se oculta el % de comisión personalizado (el servidor lo ignora). */
  verComisiones: boolean;
  /** El OCR está leyendo un documento; el formulario se reemplaza por un skeleton. */
  extrayendo?: boolean;
  /** Los datos los leyó la Captura Inteligente (OCR): se anota en la bitácora de la póliza. */
  leidaConIa?: boolean;
  /**
   * PDF subido en el panel de Captura inteligente. No tiene campo propio: se guarda
   * como carátula de la póliza al pulsar "Guardar".
   */
  caratula?: File | null;
  /** PDF del formato de negociación (GMM Colectivo), del segundo panel. Se guarda igual. */
  negociacion?: File | null;
  /** "Limpiar" o "Capturar otra": el contenedor también debe descartar el documento leído. */
  onReiniciar?: () => void;
}) {
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null);
  const [exito, setExito] = React.useState<Exito | null>(null);
  // Si el usuario corrige a mano la póliza vigor, deja de recalcularse desde el número impreso.
  // Lo mismo si llega precargada sin salir del número (p. ej. calculada de la referencia de pago).
  const [vigorManual, setVigorManual] = React.useState(() => {
    const vigor = inicial?.generales?.polizaVigor;
    return Boolean(vigor) && vigor !== extraerPolizaVigor(inicial?.generales?.numeroImpreso ?? "");
  });
  const [subiendo, setSubiendo] = React.useState<TipoArchivo | null>(null);
  const router = useRouter();
  const editando = modo.tipo === "edicion";

  // La validación es la misma que aplica la Server Action (lib/polizas/validacion.ts).
  const resolver = React.useCallback<Resolver<FormValues>>(
    async (values) => {
      const errores = validarPoliza(
        values.ramo,
        values.generales,
        values.especificos[values.ramo],
        aseguradoras.map((a) => a.value),
        esSumaIlimitada(values)
      );
      // En los ramos con censo la lista no se usa, así que no se valida.
      const erroresAsegurados = RAMOS_CON_CENSO.includes(values.ramo)
        ? {}
        : validarAsegurados(values.asegurados);
      const errorExpediente = values.expediente
        ? await validarArchivo("expediente", values.expediente)
        : null;
      if (
        Object.keys(errores).length === 0 &&
        Object.keys(erroresAsegurados).length === 0 &&
        !errorExpediente
      ) {
        return { values, errors: {} };
      }

      const errors: Record<string, unknown> & {
        generales: Record<string, unknown>;
        especificos: Record<string, unknown>;
      } = { generales: {}, especificos: {} };
      if (errorExpediente) errors.expediente = { type: "validate", message: errorExpediente };
      const porRamo: Record<string, unknown> = {};
      for (const [nombre, message] of Object.entries(errores)) {
        const destino = NOMBRES_GENERALES.has(nombre) ? errors.generales : porRamo;
        destino[nombre] = { type: "validate", message };
      }
      errors.especificos[values.ramo] = porRamo;
      // "asegurados.2.nombre" → errors.asegurados[2].nombre
      const porAsegurado: Record<string, unknown>[] = [];
      for (const [ruta, message] of Object.entries(erroresAsegurados)) {
        const [, indice, campo] = ruta.split(".");
        if (campo === undefined) continue;
        (porAsegurado[Number(indice)] ??= {})[campo] = { type: "validate", message };
      }
      if (porAsegurado.length > 0) errors.asegurados = porAsegurado;
      if (erroresAsegurados.asegurados) {
        errors.asegurados = Object.assign(porAsegurado, {
          root: { type: "validate", message: erroresAsegurados.asegurados },
        });
      }
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
  const conCenso = RAMOS_CON_CENSO.includes(ramo);
  const sumaDelRamo = SUMA_ASEGURADA[ramo];
  const sumaIlimitada = useWatch({ control, name: "sumaIlimitada" }) && Boolean(sumaDelRamo);

  function cambiarSumaIlimitada(activa: boolean) {
    setValue("sumaIlimitada", activa, { shouldDirty: true });
    if (activa) {
      // Se vacían la cantidad y su unidad: la póliza no tiene tope.
      for (const nombre of camposSumaAsegurada(ramo)) {
        setValue(`especificos.${ramo}.${nombre}`, "", { shouldDirty: true });
        clearErrors(`especificos.${ramo}.${nombre}`);
      }
    }
    limpiarAvisos();
  }
  const aseguradoraId = useWatch({ control, name: "generales.aseguradora" });
  const aseguradoraElegida = aseguradoras.find((a) => a.value === aseguradoraId);
  const nombreAseguradora = aseguradoraElegida?.label;
  // Su cobranza usa el número de póliza completo: el campo no se muestra (el servidor asigna la
  // clave interna que encadena las renovaciones).
  const sinPolizaVigor = aseguradoraElegida?.usaPolizaVigor === false;

  React.useEffect(() => {
    onRamoChange?.(ramo);
  }, [ramo, onRamoChange]);

  React.useImperativeHandle(
    ref,
    () => ({
      aplicarComplemento(datos) {
        const opciones = { shouldDirty: true, shouldValidate: submitCount > 0 };
        const actuales = getValues();
        const destino = datos.ramo ?? actuales.ramo;
        if (datos.ramo && datos.ramo !== actuales.ramo) setValue("ramo", datos.ramo, opciones);
        // Con la suma "Sin límite" (ya marcada o detectada en este documento) sus campos no se llenan.
        const ilimitada = actuales.sumaIlimitada || Boolean(datos.sumaAseguradaIlimitada);
        const camposSuma = new Set(camposSumaAsegurada(destino));
        if (datos.sumaAseguradaIlimitada && camposSuma.size > 0 && !actuales.sumaIlimitada) {
          setValue("sumaIlimitada", true, opciones);
          for (const nombre of camposSuma) setValue(`especificos.${destino}.${nombre}`, "", opciones);
        }

        for (const [nombre, valor] of Object.entries(datos.generales ?? {})) {
          if (valor && !actuales.generales[nombre]?.trim()) {
            setValue(`generales.${nombre}`, valor, opciones);
          }
        }
        for (const [nombre, valor] of Object.entries(datos.especificos ?? {})) {
          const vacio = !actuales.especificos[destino]?.[nombre]?.trim();
          if (ilimitada && camposSuma.has(nombre)) continue;
          if (valor && (vacio || CAMPOS_DEL_COMPLEMENTO.has(nombre))) {
            setValue(`especificos.${destino}.${nombre}`, valor, opciones);
          }
        }
        setErrorGeneral(null);
        setExito(null);
      },
    }),
    [getValues, setValue, submitCount]
  );

  const generalesDefs = React.useMemo(
    () =>
      camposGenerales.map((c) => (c.name === "aseguradora" ? { ...c, options: aseguradoras } : c)),
    [aseguradoras]
  );
  const camposPoliza = CAMPOS_POLIZA.filter(
    (n) => (verComisiones || n !== "comisionPersonalizadaPct") && !(sinPolizaVigor && n === "polizaVigor")
  ).map(
    (n) => generalesDefs.find((c) => c.name === n)!
  );
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
    // En una renovación se vuelve a los datos de la vigencia anterior, no a un formulario vacío.
    reset(valoresIniciales(modo.tipo === "renovacion" ? inicial : undefined));
    setVigorManual(false);
    limpiarAvisos();
    onReiniciar?.();
  }

  const onSubmit = handleSubmit(async (values) => {
    limpiarAvisos();
    try {
      await enviar(values);
    } catch (e) {
      // Sin esto, un error del navegador (p. ej. un archivo que ya no se puede leer) solo se ve en
      // la consola y el formulario se queda sin respuesta.
      console.error("[PolizaForm]", e);
      setErrorGeneral(
        esArchivoIlegible(e)
          ? `Uno de los documentos ${MENSAJE_ARCHIVO_PERDIDO}`
          : "Ocurrió un error inesperado al guardar. Revisa si la póliza aparece en Pólizas antes de volver a intentarlo."
      );
    }
  });

  async function enviar(values: FormValues) {
    for (const [tipo, archivo] of [["caratula", caratula], ["negociacion", negociacion]] as const) {
      const error = archivo ? await validarArchivo(tipo, archivo) : null;
      if (error) {
        setErrorGeneral(`${ARCHIVOS[tipo].etiqueta}: ${error}`);
        return;
      }
    }

    const datos = {
      ramo: values.ramo,
      generales: values.generales,
      especificos: values.especificos[values.ramo],
      // En los ramos con censo los asegurados no se capturan uno por uno.
      asegurados: RAMOS_CON_CENSO.includes(values.ramo) ? [] : values.asegurados,
      sumaAseguradaIlimitada: esSumaIlimitada(values),
    };

    if (modo.tipo === "edicion") {
      const editada = await editarPoliza(modo.polizaId, datos);
      if (editada.ok) {
        router.push(`/polizas/${modo.polizaId}`);
        router.refresh();
        return;
      }
      setErrorGeneral(editada.error ?? null);
      for (const [nombre, message] of Object.entries(editada.errores ?? ({} as Errores))) {
        setError(rutaCampo(nombre, values.ramo), { type: "server", message });
      }
      return;
    }

    const res = await guardarPoliza({
      ...datos,
      ...(modo.tipo === "renovacion" && { renuevaA: modo.anterior.id }),
      ...(leidaConIa && { origen: "ocr" }),
    });
    if (res.ok) {
      // La póliza ya existe: si un archivo falla no se revierte, se puede subir desde su detalle.
      const archivos: Exito["archivos"] = {};
      const porTipo: Record<TipoArchivo, File | null> = {
        caratula,
        negociacion,
        expediente: values.expediente,
      };
      for (const tipo of TIPOS_ARCHIVO) {
        const archivo = porTipo[tipo];
        if (!archivo) continue;
        setSubiendo(tipo);
        archivos[tipo] = await subirArchivo(res.poliza.id, tipo, archivo);
      }
      setSubiendo(null);
      setExito({ ...res, archivos });
      return;
    }
    setErrorGeneral(res.error ?? null);
    for (const [nombre, message] of Object.entries(res.errores ?? ({} as Errores))) {
      setError(rutaCampo(nombre, values.ramo), { type: "server", message });
    }
  }

  const bloqueado = isSubmitting || extrayendo;
  const totalErrores =
    Object.keys(errors.generales ?? {}).length +
    Object.keys(errors.especificos?.[ramo] ?? {}).length +
    (Array.isArray(errors.asegurados)
      ? errors.asegurados.reduce((n, e) => n + (e ? Object.keys(e).length : 0), 0)
      : 0) +
    (errors.expediente ? 1 : 0);

  function renderGeneral(campo: CampoDef) {
    const esImpreso = campo.name === "numeroImpreso";
    const esVigor = campo.name === "polizaVigor";
    const bloqueadoPorModo =
      (modo.tipo === "edicion" && modo.bloqueados.includes(campo.name)) ||
      (modo.tipo === "renovacion" && esVigor);
    const ayudaModo = !bloqueadoPorModo
      ? undefined
      : modo.tipo === "renovacion"
        ? "Se conserva la de la póliza anterior para mantener la cadena de renovaciones."
        : "Tiene recibos cobrados: para cambiarlo, revierte primero su conciliación.";

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
            disabled={bloqueado || bloqueadoPorModo}
            inputRef={field.ref}
            onBlur={field.onBlur}
            destacado={esVigor}
            ayuda={
              ayudaModo ?? (esVigor && vigorManual ? (
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
              ) : undefined)
            }
            onChange={(v) => {
              field.onChange(v);
              limpiarAvisos();
              // En una renovación la póliza vigor es la de la cadena: no se recalcula.
              if (esImpreso && !vigorManual && modo.tipo !== "renovacion") actualizarVigor(v);
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
          <CardTitle className="text-base">
            {modo.tipo === "edicion"
              ? `Editar póliza ${modo.numero}`
              : modo.tipo === "renovacion"
                ? `Renovación de la póliza ${modo.anterior.numero}`
                : "Nueva póliza"}
          </CardTitle>
          <CardDescription>
            {modo.tipo === "edicion"
              ? modo.bloqueados.length > 0
                ? "La póliza ya tiene recibos cobrados: la vigencia, la forma de pago y la prima total quedan fijas."
                : "Si cambias la vigencia, la forma de pago o la prima total, sus recibos se vuelven a generar."
              : modo.tipo === "renovacion"
                ? "Datos de la vigencia anterior precargados. Sube la carátula nueva o captura el número y las primas."
                : "Revisa los datos extraídos antes de guardar; todos los campos son editables."}
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

              {conCenso ? (
                <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                  En {ramoLabels[ramo]} los asegurados se manejan con un censo poblacional externo; las
                  reglas de cada subgrupo se capturan en &quot;Condiciones del Subgrupo&quot;.
                </p>
              ) : (
                <AseguradosFieldArray
                  control={control}
                  setValue={setValue}
                  validar={submitCount > 0}
                  disabled={bloqueado}
                  onCambio={limpiarAvisos}
                />
              )}

              {secciones.map((seccion) => (
                <FormSection
                  key={`${ramo}-${seccion.titulo}`}
                  titulo={seccion.titulo}
                  badge={ramoLabels[ramo]}
                >
                  {seccion.campos.map((campo) => {
                    const esSuma = campo.name === sumaDelRamo?.valor;
                    // Cantidad y unidad de una suma "Sin límite": deshabilitadas y sin requerir.
                    const bloqueadoPorSuma = sumaIlimitada && (esSuma || campo.name === sumaDelRamo?.unidad);
                    return (
                      <Controller
                        key={`${ramo}-${campo.name}`}
                        name={`especificos.${ramo}.${campo.name}`}
                        control={control}
                        render={({ field, fieldState }) => (
                          <Campo
                            campo={
                              bloqueadoPorSuma
                                ? { ...campo, required: false, placeholder: TEXTO_SUMA_ILIMITADA, hint: undefined }
                                : campo
                            }
                            accesorio={
                              esSuma ? (
                                <span className="flex items-center gap-2">
                                  <Switch
                                    id="suma-ilimitada"
                                    checked={sumaIlimitada}
                                    onCheckedChange={cambiarSumaIlimitada}
                                    disabled={bloqueado}
                                  />
                                  <Label htmlFor="suma-ilimitada" className="text-xs font-normal">
                                    Suma Ilimitada
                                  </Label>
                                </span>
                              ) : undefined
                            }
                            // Las redes médicas se sugieren según la aseguradora elegida.
                            sugerencias={
                              campo.sugerenciasPorAseguradora
                                ? (redesDeAseguradora(nombreAseguradora) ?? campo.sugerencias)
                                : campo.sugerencias
                            }
                            valor={field.value ?? ""}
                            error={fieldState.error?.message}
                            disabled={bloqueado || bloqueadoPorSuma}
                            inputRef={field.ref}
                            onBlur={field.onBlur}
                            onChange={(v) => {
                              field.onChange(v);
                              limpiarAvisos();
                            }}
                          />
                        )}
                      />
                    );
                  })}
                </FormSection>
              ))}

              {!editando && (
                <FormSection titulo="Documentos">
                  <Controller
                    name="expediente"
                    control={control}
                    render={({ field, fieldState }) => (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="campo-expediente" className="text-xs">
                          {ARCHIVOS.expediente.etiqueta}
                        </Label>
                        <ArchivoInput
                          tipo="expediente"
                          id="campo-expediente"
                          value={field.value}
                          onChange={(archivo) => {
                            field.onChange(archivo);
                            limpiarAvisos();
                          }}
                          onBlur={field.onBlur}
                          disabled={bloqueado}
                          invalid={fieldState.invalid}
                          describedBy="campo-expediente-hint"
                        />
                        <p
                          id="campo-expediente-hint"
                          className={cn("text-xs", fieldState.error ? "text-destructive" : "text-muted-foreground")}
                        >
                          {fieldState.error?.message ??
                            "Opcional. Solo se guarda como respaldo; no se analiza con IA."}
                        </p>
                      </div>
                    )}
                  />
                </FormSection>
              )}
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
              {TIPOS_ARCHIVO.map((tipo) => {
                const r = exito.archivos[tipo];
                if (!r) return null;
                return r.ok ? (
                  <p key={tipo} className="text-xs text-muted-foreground">
                    {ARCHIVOS[tipo].etiqueta} adjunto: {r.archivo.nombre}
                  </p>
                ) : (
                  <p key={tipo} className="mt-1 flex items-center gap-1.5 text-xs text-warning">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {ARCHIVOS[tipo].etiqueta}: no se adjuntó ({r.error}). Puedes subirlo desde el
                    detalle de la póliza.
                  </p>
                );
              })}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/polizas/${exito.poliza.id}`}>
                Ver póliza <ArrowRight />
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
          {editando ? (
            <Button type="button" variant="ghost" asChild>
              <Link href={`/polizas/${modo.polizaId}`}>Cancelar</Link>
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={reiniciar} disabled={bloqueado}>
              <RotateCcw /> Limpiar
            </Button>
          )}
          <Button type="submit" disabled={bloqueado || exito !== null}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {subiendo
              ? `Subiendo ${SUBIENDO[subiendo]}…`
              : isSubmitting
                ? "Guardando…"
                : editando
                  ? "Guardar cambios"
                  : modo.tipo === "renovacion"
                    ? "Guardar renovación"
                    : "Guardar póliza"}
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
  sugerencias = campo.sugerencias,
  accesorio,
  inputRef,
  onBlur,
  onChange,
}: {
  campo: CampoDef;
  /** Control extra alineado a la derecha de la etiqueta (p. ej. el switch "Suma Ilimitada"). */
  accesorio?: React.ReactNode;
  /** Reemplaza a `campo.sugerencias` (p. ej. filtradas por aseguradora). */
  sugerencias?: readonly string[];
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
  if (campo.type === "textarea") {
    control = (
      <Textarea
        id={id}
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        placeholder={campo.placeholder}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        rows={5}
        aria-invalid={invalid}
        aria-describedby={error ? errorId : pista ? `${id}-hint` : undefined}
        className="min-h-28"
      />
    );
  } else if (campo.type === "select") {
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
          <SelectValue
            placeholder={campo.placeholder ?? (opciones.length ? "Selecciona…" : "Sin opciones disponibles")}
          />
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
          autoComplete={CAMPOS_CLAVE.has(campo.name) || sugerencias ? "off" : undefined}
          list={sugerencias ? `${id}-sugerencias` : undefined}
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
        {sugerencias && (
          <datalist id={`${id}-sugerencias`}>
            {sugerencias.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", campo.wide && "sm:col-span-2")}>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <Label htmlFor={id} className="text-xs">
          {campo.label}
          {campo.required && <span className="text-primary">*</span>}
        </Label>
        {accesorio}
      </div>
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

/** Lista dinámica de asegurados (useFieldArray): editar, agregar y eliminar. */
function AseguradosFieldArray({
  control,
  setValue,
  validar,
  disabled,
  onCambio,
}: {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  /** Revalidar al cambiar valores (tras el primer intento de guardar). */
  validar: boolean;
  disabled?: boolean;
  onCambio: () => void;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "asegurados" });
  const errorLista = useFormState({ control, name: "asegurados" }).errors.asegurados?.root?.message;
  const contratante = (useWatch({ control, name: "generales.cliente" }) ?? "").replace(/\s+/g, " ").trim();
  const asegurados = useWatch({ control, name: "asegurados" });

  // El switch no guarda estado propio: está activo mientras el asegurado sea el contratante
  // como titular. Si alguien edita el nombre o el parentesco, se apaga solo.
  const esContratante = (i: number) =>
    contratante !== "" &&
    asegurados?.[i]?.parentesco === "Titular" &&
    asegurados[i].nombre.replace(/\s+/g, " ").trim().toLowerCase() === contratante.toLowerCase();

  // Datos que el formulario llenó solo (por asegurado): se actualizan mientras nadie los edite.
  const rfc = useWatch({ control, name: "generales.rfcCliente" }) ?? "";
  const inicioVigencia = useWatch({ control, name: "generales.vigenciaInicio" }) ?? "";
  const autollenado = React.useRef<Record<string, { fecha?: string; edad?: string }>>({});

  // El RFC de persona física trae la fecha de nacimiento del contratante; con ella (o con la
  // capturada) se calcula la edad al inicio de vigencia. Nunca pisa un valor escrito a mano.
  React.useEffect(() => {
    const hoy = hoyISO();
    const fechaRfc = fechaNacimientoDeRfc(rfc, hoy);
    const opciones = { shouldDirty: true, shouldValidate: validar };
    fields.forEach((field, i) => {
      const a = asegurados?.[i];
      if (!a) return;
      const previo = autollenado.current[field.id] ?? {};
      let fecha = a.fecha_nacimiento;
      if (esContratante(i) && fechaRfc && (!fecha || fecha === previo.fecha)) {
        if (fecha !== fechaRfc) setValue(`asegurados.${i}.fecha_nacimiento`, fechaRfc, opciones);
        fecha = previo.fecha = fechaRfc;
      }
      const edad = edadAl(fecha, inicioVigencia || hoy);
      if (edad !== null && (!a.edad || a.edad === previo.edad)) {
        if (a.edad !== String(edad)) setValue(`asegurados.${i}.edad`, String(edad), opciones);
        previo.edad = String(edad);
      }
      autollenado.current[field.id] = previo;
    });
  });

  function marcarContratante(i: number, activo: boolean) {
    const opciones = { shouldDirty: true, shouldValidate: validar };
    // Al desactivar se deshace lo que hizo la casilla.
    setValue(`asegurados.${i}.nombre`, activo ? contratante : "", opciones);
    setValue(`asegurados.${i}.parentesco`, activo ? "Titular" : "", opciones);
    onCambio();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Asegurados
        </h3>
        <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {fields.length}
        </span>
        <Separator className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            // El primero se propone como titular.
            append(aseguradoVacio(fields.length === 0 ? "Titular" : ""));
            onCambio();
          }}
        >
          <UserPlus /> Agregar asegurado
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
          Sin asegurados. La IA los llena desde la carátula; también puedes agregarlos manualmente.
        </p>
      )}
      {errorLista && <p className="text-xs text-destructive">{errorLista}</p>}

      <div className="space-y-3">
        {fields.map((field, i) => (
          <div key={field.id} className="rounded-lg border bg-background/60 p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">Asegurado {i + 1}</span>
              <div
                className="ml-auto flex items-center gap-2"
                title={contratante ? undefined : "Captura primero el nombre del contratante"}
              >
                <Switch
                  id={`asegurado-${i}-contratante`}
                  checked={esContratante(i)}
                  onCheckedChange={(activo) => marcarContratante(i, activo)}
                  disabled={disabled || !contratante}
                />
                <Label htmlFor={`asegurado-${i}-contratante`} className="text-xs font-normal">
                  Contratante asegurado
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label={`Eliminar asegurado ${i + 1}`}
                disabled={disabled}
                onClick={() => {
                  remove(i);
                  onCambio();
                }}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS_ASEGURADO_UI.map((def) => (
                <Controller
                  key={def.campo}
                  name={`asegurados.${i}.${def.campo}`}
                  control={control}
                  render={({ field: f, fieldState }) => (
                    <Campo
                      campo={{ ...def.definicion, name: `asegurado-${i}-${def.campo}` }}
                      valor={f.value ?? ""}
                      error={fieldState.error?.message}
                      disabled={disabled}
                      inputRef={f.ref}
                      onBlur={f.onBlur}
                      onChange={(v) => {
                        f.onChange(v);
                        onCambio();
                      }}
                    />
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Campos de cada asegurado, reutilizando el componente <Campo> del formulario.
const CAMPOS_ASEGURADO_UI: { campo: keyof AseguradoValores; definicion: CampoDef }[] = [
  { campo: "nombre", definicion: { name: "nombre", label: "Nombre completo", type: "text", required: true, wide: true, placeholder: "Nombre y apellidos" } },
  {
    campo: "parentesco",
    definicion: {
      name: "parentesco",
      label: "Parentesco",
      type: "select",
      required: true,
      options: PARENTESCOS.map((p) => ({ value: p, label: parentescoLabels[p] })),
    },
  },
  { campo: "sexo", definicion: { name: "sexo", label: "Sexo", type: "select", options: [...SEXOS] } },
  { campo: "edad", definicion: { name: "edad", label: "Edad", type: "number", placeholder: "Años", hint: "Se calcula con la fecha de nacimiento." } },
  { campo: "fecha_nacimiento", definicion: { name: "fecha_nacimiento", label: "Fecha de nacimiento", type: "date", hint: "Del contratante asegurado, se toma de su RFC." } },
  { campo: "antiguedad", definicion: { name: "antiguedad", label: "Antigüedad", type: "text", placeholder: "Ej. 2015-03-01" } },
];
