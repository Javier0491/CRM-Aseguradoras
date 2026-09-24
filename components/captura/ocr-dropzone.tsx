"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
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
import { formatFecha, formatMoneda } from "@/lib/format";
import {
  OCR_MAX_BYTES,
  OCR_TIPOS_PERMITIDOS,
  type ExtraccionPoliza,
  type OcrRespuesta,
} from "@/lib/ocr/types";
import { camposGenerales, FORMAS_PAGO, ramoLabels } from "@/lib/polizas/ramos";
import { cn } from "@/lib/utils";

type Estado =
  | { status: "idle" }
  | { status: "procesando"; archivo: File }
  | { status: "listo"; archivo: File; datos: ExtraccionPoliza; modelo: string }
  | { status: "error"; archivo?: File; mensaje: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validarArchivo(archivo: File): string | null {
  if (!(OCR_TIPOS_PERMITIDOS as readonly string[]).includes(archivo.type)) {
    return "Formato no soportado. Usa PDF, PNG, JPG o WEBP.";
  }
  if (archivo.size > OCR_MAX_BYTES) return "El archivo excede el límite de 10 MB.";
  return null;
}

export function OcrDropzone({
  onAplicar,
  onProcesando,
  onLimpiar,
}: {
  /** Se invoca en cuanto termina la extracción para prellenar el formulario. */
  onAplicar: (datos: ExtraccionPoliza, archivo: File) => void;
  onProcesando?: (procesando: boolean) => void;
  /** El usuario descartó el documento con "Limpiar". */
  onLimpiar?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const previewRef = React.useRef<string | null>(null);
  const [arrastrando, setArrastrando] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [estado, setEstado] = React.useState<Estado>({ status: "idle" });

  const actualizarPreview = React.useCallback((archivo: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url =
      archivo && archivo.type.startsWith("image/")
        ? URL.createObjectURL(archivo)
        : null;
    previewRef.current = url;
    setPreview(url);
  }, []);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    []
  );

  async function procesar(archivo: File) {
    const invalido = validarArchivo(archivo);
    if (invalido) {
      actualizarPreview(null);
      setEstado({ status: "error", archivo, mensaje: invalido });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    actualizarPreview(archivo);
    setEstado({ status: "procesando", archivo });
    onProcesando?.(true);

    try {
      const body = new FormData();
      body.append("file", archivo);
      const res = await fetch("/api/ocr", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const json = (await res.json()) as OcrRespuesta;
      if (!json.ok) {
        setEstado({ status: "error", archivo, mensaje: json.error });
        return;
      }
      setEstado({
        status: "listo",
        archivo,
        datos: json.datos,
        modelo: json.modelo,
      });
      onAplicar(json.datos, archivo);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error(e);
      setEstado({
        status: "error",
        archivo,
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
    actualizarPreview(null);
    setEstado({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
    onLimpiar?.();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    const archivo = e.dataTransfer.files[0];
    if (archivo) procesar(archivo);
  }

  const archivo = estado.status === "idle" ? undefined : estado.archivo;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          Captura inteligente
        </CardTitle>
        <CardDescription>
          Sube la carátula de la póliza y la IA extraerá los datos clave.
        </CardDescription>
        {archivo && (
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
          aria-label="Subir documento de póliza"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
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
              {arrastrando ? "Suelta el archivo aquí" : "Arrastra un PDF o imagen, o haz clic para seleccionar"}
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, PNG, JPG o WEBP · máximo 10 MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={OCR_TIPOS_PERMITIDOS.join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) procesar(f);
            }}
          />
        </div>

        {archivo && (
          <div className="flex items-center gap-3 rounded-lg border bg-background/60 p-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL local
              <img
                src={preview}
                alt=""
                className="size-12 rounded-md border object-cover"
              />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-md border bg-card">
                <FileText className="size-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{archivo.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(archivo.size)}
              </p>
            </div>
            <EstadoBadge estado={estado} />
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
            onAplicar={() => onAplicar(estado.datos, estado.archivo)}
          />
        )}
      </CardContent>
    </Card>
  );
}

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
  if (campo === "primaTotal") return formatMoneda(Number(valor));
  if (campo === "vigenciaInicio" || campo === "vigenciaFin") return formatFecha(`${valor}T00:00:00Z`);
  if (campo === "formaPago") return formaPagoLabel[valor] ?? valor;
  return valor;
}

function ResultadoExtraccion({
  datos,
  modelo,
  onAplicar,
}: {
  datos: ExtraccionPoliza;
  modelo: string;
  onAplicar: () => void;
}) {
  const filas = [
    { campo: "ramo", label: "Ramo", valor: datos.ramo ? ramoLabels[datos.ramo] : undefined },
    ...camposGenerales.map((c) => ({
      campo: c.name,
      label: c.label,
      valor: datos.generales[c.name] ? mostrarValor(c.name, datos.generales[c.name]) : undefined,
    })),
    ...(datos.referenciaPago
      ? [{ campo: "referenciaPago", label: "Referencia de pago", valor: datos.referenciaPago }]
      : []),
  ];
  const detectados = filas.filter((f) => f.valor).length;
  const especificos = Object.keys(datos.especificos).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Datos detectados · {detectados}/{filas.length}
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
        La IA puede equivocarse: verifica los datos contra la carátula antes de guardar.
      </p>
    </div>
  );
}

function ResultadoSkeleton() {
  return (
    <div className="space-y-2" aria-live="polite" aria-busy="true">
      <p className="text-xs text-muted-foreground">Leyendo la carátula con IA; puede tardar hasta un minuto…</p>
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
