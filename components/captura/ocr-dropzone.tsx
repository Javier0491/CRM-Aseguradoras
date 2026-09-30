"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { copiarTodosEnMemoria } from "@/lib/archivos/memoria";
import { formatFecha, formatMoneda } from "@/lib/format";
import {
  OCR_MAX_ARCHIVOS,
  OCR_MAX_BYTES,
  OCR_MAX_BYTES_TOTAL,
  OCR_TIPOS_PERMITIDOS,
  type ContextoOcr,
  type ExtraccionPoliza,
  type OcrRespuesta,
} from "@/lib/ocr/types";
import { camposGenerales, FORMAS_PAGO, ramoLabels } from "@/lib/polizas/ramos";
import { cn } from "@/lib/utils";

type Estado =
  | { status: "idle" }
  | { status: "procesando"; archivos: File[] }
  | { status: "listo"; archivos: File[]; datos: ExtraccionPoliza; modelo: string }
  | { status: "error"; archivos: File[]; mensaje: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validarArchivos(archivos: File[]): string | null {
  if (archivos.length > OCR_MAX_ARCHIVOS) {
    return `Sube como máximo ${OCR_MAX_ARCHIVOS} documentos a la vez.`;
  }
  for (const archivo of archivos) {
    if (!(OCR_TIPOS_PERMITIDOS as readonly string[]).includes(archivo.type)) {
      return `"${archivo.name}": formato no soportado. Usa PDF, PNG, JPG o WEBP.`;
    }
    if (archivo.size > OCR_MAX_BYTES) return `"${archivo.name}" excede el límite de 10 MB.`;
  }
  if (archivos.reduce((s, a) => s + a.size, 0) > OCR_MAX_BYTES_TOTAL) {
    return "Los documentos exceden en conjunto el límite de 25 MB.";
  }
  return null;
}

export function OcrDropzone({
  onAplicar,
  onProcesando,
  onLimpiar,
  titulo = "Captura inteligente",
  descripcion = "Sube la carátula de la póliza (y, si hace falta, el recibo u otros documentos) y la IA cruzará los datos clave.",
  contexto,
}: {
  titulo?: string;
  descripcion?: string;
  /** Contexto de la lectura para la IA (p. ej. formato de negociación de GMM Colectivo). */
  contexto?: ContextoOcr;
  /**
   * Se invoca en cuanto termina la extracción para prellenar el formulario. `archivos`
   * son todos los documentos leídos, en el orden en que se subieron.
   */
  onAplicar: (datos: ExtraccionPoliza, archivos: File[]) => void;
  onProcesando?: (procesando: boolean) => void;
  /** El usuario descartó el documento con "Limpiar". */
  onLimpiar?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const agregarRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const previewsRef = React.useRef<Map<File, string>>(new Map());
  const [arrastrando, setArrastrando] = React.useState(false);
  const [arrastrandoAgregar, setArrastrandoAgregar] = React.useState(false);
  const [previews, setPreviews] = React.useState<Map<File, string>>(new Map());
  const [estado, setEstado] = React.useState<Estado>({ status: "idle" });

  const actualizarPreviews = React.useCallback((archivos: File[]) => {
    for (const url of previewsRef.current.values()) URL.revokeObjectURL(url);
    const mapa = new Map(
      archivos
        .filter((a) => a.type.startsWith("image/"))
        .map((a) => [a, URL.createObjectURL(a)] as const)
    );
    previewsRef.current = mapa;
    setPreviews(mapa);
  }, []);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
      for (const url of previewsRef.current.values()) URL.revokeObjectURL(url);
    },
    []
  );

  async function procesar(seleccion: File[]) {
    if (seleccion.length === 0) return;
    const invalido = validarArchivos(seleccion);
    if (invalido) {
      actualizarPreviews([]);
      setEstado({ status: "error", archivos: seleccion, mensaje: invalido });
      return;
    }
    // Copia en memoria: la carátula se vuelve a leer al guardar la póliza, y para entonces el
    // archivo original pudo desaparecer (p. ej. si se arrastró desde dentro de un ZIP).
    const copia = await copiarTodosEnMemoria(seleccion);
    if (!copia.ok) {
      actualizarPreviews([]);
      setEstado({ status: "error", archivos: seleccion, mensaje: copia.error });
      return;
    }
    const archivos = copia.archivos;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    actualizarPreviews(archivos);
    setEstado({ status: "procesando", archivos });
    onProcesando?.(true);

    try {
      const body = new FormData();
      for (const archivo of archivos) body.append("files", archivo);
      if (contexto) body.append("contexto", contexto);
      const res = await fetch("/api/ocr", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const json = (await res.json()) as OcrRespuesta;
      if (!json.ok) {
        setEstado({ status: "error", archivos, mensaje: json.error });
        return;
      }
      setEstado({
        status: "listo",
        archivos,
        datos: json.datos,
        modelo: json.modelo,
      });
      onAplicar(json.datos, archivos);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error(e);
      setEstado({
        status: "error",
        archivos,
        mensaje: "No se pudo contactar al servicio de extracción.",
      });
    } finally {
      // Una petición abortada por otra más reciente no debe apagar el indicador.
      if (abortRef.current === controller) onProcesando?.(false);
    }
  }

  function limpiar() {
    abortRef.current?.abort();
    abortRef.current = null;
    onProcesando?.(false);
    actualizarPreviews([]);
    setEstado({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
    onLimpiar?.();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    procesar(Array.from(e.dataTransfer.files));
  }

  /** Suma documentos a los ya leídos (p. ej. la factura tras la carátula) y vuelve a leer todos. */
  function agregar(nuevos: File[]) {
    if (nuevos.length) procesar([...archivos, ...nuevos]);
  }

  const archivos = estado.status === "idle" ? [] : estado.archivos;
  const puedeAgregar =
    estado.status !== "procesando" && archivos.length > 0 && archivos.length < OCR_MAX_ARCHIVOS;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {titulo}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
        {archivos.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={limpiar}>
              <X /> Limpiar
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Subir documentos de póliza"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setArrastrando(true);
          }}
          onDragLeave={(e) => {
            if (!salioDeLaZona(e)) return;
            setArrastrando(false);
          }}
          onDrop={onDrop}
          className={cn(
            "group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors outline-none",
            "bg-background/60 hover:border-primary/60 hover:bg-primary/[0.03] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40",
            arrastrando && "border-primary bg-primary/[0.06]"
          )}
        >
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors group-hover:text-primary",
              arrastrando && "border-primary/60 text-primary"
            )}
          >
            <UploadCloud className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {arrastrando
                ? "Suelta los archivos aquí"
                : archivos.length > 0
                  ? "Arrastra aquí para empezar de nuevo con otros documentos"
                  : "Arrastra uno o varios PDF o imágenes, o haz clic para seleccionar"}
            </p>
            <p className="text-xs text-muted-foreground">
              Carátula, recibo, constancia fiscal… · hasta {OCR_MAX_ARCHIVOS} archivos de 10 MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={OCR_TIPOS_PERMITIDOS.join(",")}
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              procesar(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        {archivos.length > 0 && (
          <div className="space-y-2">
            <ul className="divide-y rounded-lg border bg-background/60">
              {archivos.map((archivo, i) => {
                const preview = previews.get(archivo);
                return (
                  <li key={`${archivo.name}-${i}`} className="flex items-center gap-3 p-3">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- blob URL local
                      <img
                        src={preview}
                        alt=""
                        className="size-10 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-md border bg-card">
                        <FileText className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{archivo.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(archivo.size)}
                      </p>
                    </div>
                    {i === 0 && <EstadoBadge estado={estado} />}
                  </li>
                );
              })}
            </ul>
            {puedeAgregar && (
              <>
                <button
                  type="button"
                  onClick={() => agregarRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setArrastrandoAgregar(true);
                  }}
                  onDragLeave={(e) => {
                    if (salioDeLaZona(e)) setArrastrandoAgregar(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastrandoAgregar(false);
                    agregar(Array.from(e.dataTransfer.files));
                  }}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground transition-colors outline-none",
                    "hover:border-primary/60 hover:bg-primary/[0.03] hover:text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40",
                    arrastrandoAgregar && "border-primary bg-primary/[0.06] text-primary"
                  )}
                >
                  <Plus className="size-4 shrink-0" />
                  {arrastrandoAgregar
                    ? "Suelta para agregarlo y volver a leer"
                    : "Arrastra aquí la factura u otro documento, o haz clic, para agregarlo y volver a leer"}
                </button>
                <input
                  ref={agregarRef}
                  type="file"
                  accept={OCR_TIPOS_PERMITIDOS.join(",")}
                  multiple
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const nuevos = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    agregar(nuevos);
                  }}
                />
              </>
            )}
          </div>
        )}

        {estado.status === "error" && (
          <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {estado.mensaje}
          </p>
        )}

        {estado.status === "procesando" && <ResultadoSkeleton />}

        {estado.status === "listo" && (
          <ResultadoExtraccion
            datos={estado.datos}
            modelo={estado.modelo}
            documentos={estado.archivos.length}
            onAplicar={() => onAplicar(estado.datos, estado.archivos)}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** dragleave también salta al pasar sobre los hijos de la zona: solo cuenta salir de ella. */
const salioDeLaZona = (e: React.DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null);

function EstadoBadge({ estado }: { estado: Estado }) {
  switch (estado.status) {
    case "procesando":
      return (
        <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
          <Loader2 className="size-3 animate-spin" /> Analizando
        </Badge>
      );
    case "listo":
      return (
        <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/10 text-success">
          <CheckCircle2 className="size-3" /> Extraído
        </Badge>
      );
    case "error":
      return (
        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
          Error
        </Badge>
      );
    default:
      return null;
  }
}

const formaPagoLabel = Object.fromEntries(FORMAS_PAGO.map((f) => [f.value, f.label]));

function mostrarValor(campo: string, valor: string) {
  if (campo === "primaTotal" || campo === "primaNeta") return formatMoneda(Number(valor));
  if (campo === "vigenciaInicio" || campo === "vigenciaFin") return formatFecha(`${valor}T00:00:00Z`);
  if (campo === "formaPago") return formaPagoLabel[valor] ?? valor;
  return valor;
}

function ResultadoExtraccion({
  datos,
  modelo,
  documentos,
  onAplicar,
}: {
  datos: ExtraccionPoliza;
  modelo: string;
  documentos: number;
  onAplicar: () => void;
}) {
  const filas = [
    { campo: "ramo", label: "Ramo", valor: datos.ramo ? ramoLabels[datos.ramo] : undefined },
    ...camposGenerales.map((c) => ({
      campo: c.name,
      label: c.label,
      valor: datos.generales[c.name] ? mostrarValor(c.name, datos.generales[c.name]) : undefined,
    })),
    { campo: "referenciaPago", label: "Referencia de pago", valor: datos.referenciaPago ?? undefined },
    {
      campo: "asegurados",
      label: "Asegurados",
      valor: datos.asegurados.length
        ? datos.asegurados.map((a) => `${a.nombre} (${a.parentesco})`).join(", ")
        : undefined,
    },
  ];
  const detectados = filas.filter((f) => f.valor).length;
  const especificos = Object.keys(datos.especificos).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Datos detectados · {detectados}/{filas.length}
          {documentos > 1 && ` · ${documentos} documentos`}
        </p>
        <span className="font-mono text-[11px] text-muted-foreground">{modelo}</span>
      </div>
      <dl className="divide-y rounded-lg border">
        {filas.map((f) => (
          <div key={f.campo} className="flex items-start gap-3 px-3 py-2">
            <dt className="w-28 shrink-0 pt-px text-xs text-muted-foreground">{f.label}</dt>
            <dd
              className={cn(
                "min-w-0 flex-1 text-sm break-words tabular-nums",
                f.valor ? "font-medium" : "text-xs text-muted-foreground italic"
              )}
            >
              {f.valor ?? "No detectado"}
            </dd>
          </div>
        ))}
      </dl>
      {datos.ramo && (
        <p className="text-xs text-muted-foreground">
          {especificos > 0
            ? `${especificos} ${especificos === 1 ? "campo específico" : "campos específicos"} de ${ramoLabels[datos.ramo]} detectados.`
            : `Sin campos específicos de ${ramoLabels[datos.ramo]} detectados.`}
        </p>
      )}
      {datos.advertencias.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
          <p className="mb-1.5 flex items-center gap-1.5 font-medium">
            <AlertCircle className="size-3.5" /> Revisa antes de guardar
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {datos.advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-success">
        <CheckCircle2 className="size-3.5" /> Datos aplicados al formulario.
      </p>
      <Button variant="outline" size="sm" className="w-full" onClick={onAplicar}>
        <RotateCcw /> Volver a aplicar
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        La IA puede equivocarse: verifica los datos contra los documentos antes de guardar.
      </p>
    </div>
  );
}

function ResultadoSkeleton() {
  return (
    <div className="space-y-2" aria-live="polite" aria-busy="true">
      <p className="text-xs text-muted-foreground">Leyendo los documentos con IA; puede tardar hasta un minuto…</p>
      <div className="divide-y rounded-lg border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
