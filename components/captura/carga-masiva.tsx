"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileText,
  FolderOpen,
  FolderArchive,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SearchCheck,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { toast } from "sonner";

import { ContactosPendientes } from "@/components/captura/contactos-pendientes";
import { PolizaForm } from "@/components/captura/poliza-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agruparPolizas, caratulaDe, type Omitido, type UnidadPoliza } from "@/lib/carga-masiva/agrupar";
import { terminarCargaMasiva } from "@/lib/carga-masiva/actions";
import { comoArchivo, expedienteDe, fuenteDeCarpeta, fuenteDeZip, leerDocumento, type Fuente } from "@/lib/carga-masiva/fuente";
import { procesarPoliza, SesionVencida, type EstadoPoliza } from "@/lib/carga-masiva/procesar";
import { ErrorZip } from "@/lib/archivos/zip";
import { formatNumero } from "@/lib/format";
import type { Opcion } from "@/lib/polizas/ramos";
import { cn } from "@/lib/utils";

/** Pólizas que se leen a la vez: más rápido sin saturar a la IA. */
const SIMULTANEAS = 3;
const POR_PAGINA = 100;
const SIN_EJECUTIVO = "__sin_asignar__";

type Tipo = EstadoPoliza["tipo"];
type Filtro = "todas" | "pendiente" | "guardada" | "revisar" | "rfc_generico" | "ya_existia" | "sin_documentos" | "error" | "descartada";

const FILTROS: { valor: Filtro; etiqueta: string; tono: string }[] = [
  { valor: "todas", etiqueta: "Todas", tono: "" },
  { valor: "pendiente", etiqueta: "Pendientes", tono: "text-muted-foreground" },
  { valor: "guardada", etiqueta: "Guardadas", tono: "text-success" },
  { valor: "revisar", etiqueta: "Por revisar", tono: "text-warning" },
  { valor: "rfc_generico", etiqueta: "RFC genérico", tono: "text-warning" },
  { valor: "ya_existia", etiqueta: "Ya estaban en el CRM", tono: "text-muted-foreground" },
  { valor: "sin_documentos", etiqueta: "Sin documentos", tono: "text-muted-foreground" },
  { valor: "error", etiqueta: "Con error", tono: "text-destructive" },
  { valor: "descartada", etiqueta: "Descartadas", tono: "text-muted-foreground" },
];

/** Estados que ya no se vuelven a leer al continuar la carga. */
const TERMINADOS = new Set<Tipo>(["guardada", "revisar", "ya_existia", "sin_documentos", "descartada"]);

const enFiltro = (e: EstadoPoliza, f: Filtro) =>
  f === "todas" ||
  (f === "pendiente" ? e.tipo === "pendiente" || e.tipo === "leyendo" : f === "rfc_generico" ? e.tipo === "revisar" && e.rfcGenerico : e.tipo === f);

// El avance se recuerda en este navegador: si se cierra la pestaña, al volver a elegir la carpeta
// sigue donde se quedó. Puede no estar disponible (modo privado): entonces solo dura la sesión.
const claveAvance = (usuarioId: string) => `zensecure:carga-masiva:${usuarioId}`;
function leerAvance(usuarioId: string): Record<string, EstadoPoliza> {
  try {
    const crudo = window.localStorage.getItem(claveAvance(usuarioId));
    return crudo ? (JSON.parse(crudo) as Record<string, EstadoPoliza>) : {};
  } catch {
    return {};
  }
}
function guardarAvance(usuarioId: string, estados: Record<string, EstadoPoliza>) {
  try {
    // Lo que se estaba leyendo cuando se cerró vuelve a la cola.
    const persistibles = Object.fromEntries(Object.entries(estados).filter(([, e]) => e.tipo !== "leyendo" && e.tipo !== "pendiente"));
    window.localStorage.setItem(claveAvance(usuarioId), JSON.stringify(persistibles));
  } catch {
    // Sin almacenamiento disponible: el avance solo vive mientras la página esté abierta.
  }
}

/**
 * Carga masiva de la cartera: el administrador elige la carpeta con sus pólizas (o un ZIP de ella),
 * el CRM la separa en pólizas y las va leyendo con IA de 3 en 3. Las que se leen sin dudas se
 * guardan solas con su carátula; las demás quedan "por revisar" con el formulario ya lleno.
 */
export function CargaMasiva({
  usuarioId,
  aseguradoras,
  verComisiones,
  ejecutivos,
  ejecutivoPredeterminado,
}: {
  usuarioId: string;
  aseguradoras: Opcion[];
  verComisiones: boolean;
  ejecutivos?: { id: string; nombre: string }[];
  ejecutivoPredeterminado: string;
}) {
  const carpetaRef = React.useRef<HTMLInputElement>(null);
  const zipRef = React.useRef<HTMLInputElement>(null);
  const [fuente, setFuente] = React.useState<Fuente | null>(null);
  const [abriendo, setAbriendo] = React.useState(false);
  const [unidades, setUnidades] = React.useState<UnidadPoliza[]>([]);
  const [omitidos, setOmitidos] = React.useState<Omitido[]>([]);
  const [estados, setEstados] = React.useState<Record<string, EstadoPoliza>>({});
  const estadosRef = React.useRef(estados);
  const [corriendo, setCorriendo] = React.useState(false);
  const controlRef = React.useRef<AbortController | null>(null);
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [pagina, setPagina] = React.useState(1);
  const [ejecutivoId, setEjecutivoId] = React.useState(ejecutivoPredeterminado);
  const [revisando, setRevisando] = React.useState<UnidadPoliza | null>(null);

  // El avance de una carga anterior se recupera al abrir la página.
  React.useEffect(() => {
    const previo = leerAvance(usuarioId);
    estadosRef.current = previo;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador
    setEstados(previo);
  }, [usuarioId]);

  // Cerrar la pestaña detiene la carga: se pide confirmación mientras corre.
  React.useEffect(() => {
    if (!corriendo) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [corriendo]);

  function actualizar(clave: string, estado: EstadoPoliza) {
    estadosRef.current = { ...estadosRef.current, [clave]: estado };
    setEstados(estadosRef.current);
    guardarAvance(usuarioId, estadosRef.current);
  }

  async function elegir(origen: () => Promise<Fuente>) {
    controlRef.current?.abort();
    setAbriendo(true);
    try {
      const nueva = await origen();
      const agrupado = agruparPolizas([...nueva.archivos.values()]);
      setFuente(nueva);
      setUnidades(agrupado.unidades);
      setOmitidos(agrupado.omitidos);
      setPagina(1);
      if (agrupado.unidades.length === 0) toast.error("No se encontraron pólizas en lo que elegiste.");
    } catch (e) {
      toast.error(e instanceof ErrorZip ? e.message : "No se pudo abrir lo que elegiste.");
    } finally {
      setAbriendo(false);
    }
  }

  async function iniciar() {
    if (!fuente) return;
    const control = new AbortController();
    controlRef.current = control;
    setCorriendo(true);
    const cola = unidades.filter((u) => !TERMINADOS.has(estadosRef.current[u.clave]?.tipo ?? "pendiente"));
    let siguiente = 0;
    let sesionVencida = false;
    const trabajador = async () => {
      while (!control.signal.aborted && siguiente < cola.length) {
        const unidad = cola[siguiente++];
        actualizar(unidad.clave, { tipo: "leyendo" });
        try {
          const estado = await procesarPoliza(unidad, fuente, {
            aseguradoras,
            ejecutivoId: ejecutivos ? (ejecutivoId === SIN_EJECUTIVO ? "" : ejecutivoId) : undefined,
            senal: control.signal,
          });
          actualizar(unidad.clave, estado);
        } catch (e) {
          actualizar(unidad.clave, { tipo: "pendiente" });
          if (e instanceof SesionVencida) {
            sesionVencida = true;
            control.abort();
          }
        }
      }
    };
    await Promise.all(Array.from({ length: SIMULTANEAS }, trabajador));
    if (controlRef.current === control) controlRef.current = null;
    setCorriendo(false);
    void terminarCargaMasiva();
    if (sesionVencida) toast.error("Tu sesión expiró: inicia sesión de nuevo y continúa la carga.");
    else if (!control.signal.aborted) toast.success("Carga masiva terminada.");
  }

  function pausar() {
    controlRef.current?.abort();
  }

  const conEstado = unidades.map((u) => ({ unidad: u, estado: estados[u.clave] ?? ({ tipo: "pendiente" } as EstadoPoliza) }));
  const cuenta = (f: Filtro) => conEstado.filter((x) => enFiltro(x.estado, f)).length;
  const terminadas = conEstado.filter((x) => TERMINADOS.has(x.estado.tipo)).length;
  const visibles = conEstado.filter((x) => enFiltro(x.estado, filtro));
  const copias = unidades.reduce((s, u) => s + u.copias.length, 0);
  const clientesGuardados = [
    ...new Set(conEstado.flatMap((x) => (x.estado.tipo === "guardada" ? [x.estado.clienteId] : []))),
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Elige tu carpeta de pólizas</CardTitle>
          <CardDescription>
            Elige la carpeta completa (por ejemplo «CRM»); no hace falta comprimirla. El CRM la separa en pólizas:
            carpetas como «24-25 619607 NOMBRE», carpetas con su subcarpeta Carátula, ZIP de los portales y PDF
            sueltos. Nada se sube hasta que se guarda cada póliza.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => carpetaRef.current?.click()} disabled={corriendo || abriendo}>
              {abriendo ? <Loader2 className="animate-spin" /> : <FolderOpen />} Elegir carpeta
            </Button>
            <Button variant="outline" onClick={() => zipRef.current?.click()} disabled={corriendo || abriendo}>
              <FolderArchive /> Elegir un ZIP de la carpeta
            </Button>
            <input
              ref={carpetaRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              multiple
              // El selector de carpetas del navegador (no está en los tipos de React).
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(e) => {
                const archivos = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (archivos.length) void elegir(async () => fuenteDeCarpeta(archivos));
              }}
            />
            <input
              ref={zipRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const zip = e.target.files?.[0];
                e.target.value = "";
                if (zip) void elegir(() => fuenteDeZip(zip));
              }}
            />
          </div>
          {fuente && (
            <p className="text-sm">
              <span className="font-medium">{fuente.nombre}</span>: {formatNumero(fuente.archivos.size)} archivos ·{" "}
              <span className="font-medium">{formatNumero(unidades.length)} pólizas</span>
              {copias > 0 && ` · ${formatNumero(copias)} ${copias === 1 ? "copia repetida que no se lee" : "copias repetidas que no se leen"}`}
              {omitidos.length > 0 &&
                ` · ${formatNumero(omitidos.length)} ${omitidos.length === 1 ? "archivo que no es póliza" : "archivos que no son pólizas"}`}
            </p>
          )}
          {!fuente && Object.keys(estados).length > 0 && (
            <p className="text-sm text-muted-foreground">
              Hay una carga anterior en este navegador ({formatNumero(Object.keys(estados).length)} pólizas procesadas):
              elige la misma carpeta para continuar donde se quedó.
            </p>
          )}
        </CardContent>
      </Card>

      {fuente && unidades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Lectura con IA</CardTitle>
            <CardDescription>
              Las pólizas se leen de {SIMULTANEAS} en {SIMULTANEAS} y no descuentan escaneos del plan. Deja esta pestaña
              abierta; si la cierras o la pausas, vuelve a elegir la carpeta y sigue donde se quedó.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              {ejecutivos && (
                <div className="space-y-1.5">
                  <Label htmlFor="ejecutivo-masiva" className="text-xs">
                    Ejecutivo responsable de las pólizas
                  </Label>
                  <Select value={ejecutivoId || SIN_EJECUTIVO} onValueChange={setEjecutivoId} disabled={corriendo}>
                    <SelectTrigger id="ejecutivo-masiva" className="w-60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_EJECUTIVO}>Sin asignar</SelectItem>
                      {ejecutivos.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {corriendo ? (
                <Button variant="outline" onClick={pausar}>
                  <Pause /> Pausar
                </Button>
              ) : (
                <Button onClick={() => void iniciar()} disabled={terminadas === unidades.length}>
                  <Play /> {terminadas > 0 ? "Continuar la carga" : "Empezar la carga"}
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Pólizas procesadas"
                aria-valuemin={0}
                aria-valuemax={unidades.length}
                aria-valuenow={terminadas}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: `${(terminadas / unidades.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatNumero(terminadas)} de {formatNumero(unidades.length)} pólizas procesadas
                {corriendo && " · leyendo…"}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
              {FILTROS.map((f) => {
                const n = cuenta(f.valor);
                if (f.valor !== "todas" && n === 0) return null;
                return (
                  <Button
                    key={f.valor}
                    size="sm"
                    variant={filtro === f.valor ? "secondary" : "ghost"}
                    aria-pressed={filtro === f.valor}
                    onClick={() => {
                      setFiltro(f.valor);
                      setPagina(1);
                    }}
                    className="h-7 gap-1.5 px-2.5 text-xs"
                  >
                    <span className={f.tono}>{f.etiqueta}</span>
                    <span className="text-muted-foreground tabular-nums">{formatNumero(n)}</span>
                  </Button>
                );
              })}
            </div>

            <ul className="divide-y rounded-lg border">
              {visibles.slice(0, pagina * POR_PAGINA).map(({ unidad, estado }) => (
                <FilaPoliza
                  key={unidad.clave}
                  unidad={unidad}
                  estado={estado}
                  ocupado={corriendo}
                  onRevisar={() => setRevisando(unidad)}
                  onReintentar={() => actualizar(unidad.clave, { tipo: "pendiente" })}
                  onDescartar={() => actualizar(unidad.clave, { tipo: "descartada" })}
                />
              ))}
              {visibles.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nada en este apartado.</li>}
            </ul>
            {visibles.length > pagina * POR_PAGINA && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setPagina((p) => p + 1)}>
                Ver {formatNumero(Math.min(POR_PAGINA, visibles.length - pagina * POR_PAGINA))} más
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {clientesGuardados.length > 0 && <ContactosPendientes clienteIds={clientesGuardados} actualizando={corriendo} />}

      <RevisarPoliza
        unidad={revisando}
        estado={revisando ? estados[revisando.clave] : undefined}
        fuente={fuente}
        aseguradoras={aseguradoras}
        verComisiones={verComisiones}
        ejecutivos={ejecutivos}
        ejecutivoPredeterminado={ejecutivoId === SIN_EJECUTIVO ? "" : ejecutivoId}
        onCerrar={() => setRevisando(null)}
        onGuardada={(clave, guardada) => actualizar(clave, guardada)}
      />
    </div>
  );
}

const ICONOS: Record<Tipo, React.ReactNode> = {
  pendiente: <span className="size-2 rounded-full bg-muted-foreground/40" />,
  leyendo: <Loader2 className="size-4 animate-spin text-primary" />,
  guardada: <CheckCircle2 className="size-4 text-success" />,
  revisar: <SearchCheck className="size-4 text-warning" />,
  ya_existia: <Copy className="size-4 text-muted-foreground" />,
  sin_documentos: <UserRoundX className="size-4 text-muted-foreground" />,
  descartada: <Trash2 className="size-4 text-muted-foreground" />,
  error: <AlertCircle className="size-4 text-destructive" />,
};

function FilaPoliza({
  unidad,
  estado,
  ocupado,
  onRevisar,
  onReintentar,
  onDescartar,
}: {
  unidad: UnidadPoliza;
  estado: EstadoPoliza;
  ocupado: boolean;
  onRevisar: () => void;
  onReintentar: () => void;
  onDescartar: () => void;
}) {
  const contratante = "rfc" in estado ? estado : null;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center pt-0.5">{ICONOS[estado.tipo]}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{unidad.nombre}</p>
        {contratante && (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {contratante.cliente || "Sin nombre"} · RFC{" "}
            <span className={cn("font-mono", estado.tipo === "revisar" && estado.rfcGenerico && "font-medium text-warning")}>
              {contratante.rfc || "—"}
            </span>
            {contratante.numero && ` · Póliza ${contratante.numero}`}
          </p>
        )}
        {estado.tipo === "revisar" && (
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-warning">
            {estado.motivos.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        {estado.tipo === "error" && <p className="text-xs text-destructive">{estado.mensaje}</p>}
        {estado.tipo === "guardada" && estado.aviso && <p className="text-xs text-warning">{estado.aviso}</p>}
        {estado.tipo === "ya_existia" && <p className="text-xs text-muted-foreground">Esta póliza y vigencia ya estaban en el CRM.</p>}
        {estado.tipo === "sin_documentos" && (
          <p className="text-xs text-muted-foreground">No tiene carátula ni otro PDF que leer.</p>
        )}
        {unidad.copias.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            También en: {unidad.copias.slice(0, 2).join(" · ")}
            {unidad.copias.length > 2 && ` y ${unidad.copias.length - 2} más`}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {estado.tipo === "guardada" && (
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link href={`/polizas/${estado.polizaId}`} target="_blank">
              Ver póliza
            </Link>
          </Button>
        )}
        {estado.tipo === "revisar" && (
          <Button size="sm" className="h-7 text-xs" onClick={onRevisar}>
            Revisar
          </Button>
        )}
        {(estado.tipo === "error" || estado.tipo === "descartada" || estado.tipo === "sin_documentos") && !ocupado && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onReintentar}>
            <RotateCcw /> Volver a leer
          </Button>
        )}
        {(estado.tipo === "revisar" || estado.tipo === "error") && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onDescartar}>
            Descartar
          </Button>
        )}
      </div>
    </li>
  );
}

type ArchivosRevision = {
  documentos: { ref: string; archivo: File }[];
  caratula: File | null;
  negociacion: File | null;
  expediente: File | null;
  avisoExpediente: string | null;
};

/** Formulario prellenado de una póliza con dudas, con sus documentos a la mano. */
function RevisarPoliza({
  unidad,
  estado,
  fuente,
  aseguradoras,
  verComisiones,
  ejecutivos,
  ejecutivoPredeterminado,
  onCerrar,
  onGuardada,
}: {
  unidad: UnidadPoliza | null;
  estado: EstadoPoliza | undefined;
  fuente: Fuente | null;
  aseguradoras: Opcion[];
  verComisiones: boolean;
  ejecutivos?: { id: string; nombre: string }[];
  ejecutivoPredeterminado: string;
  onCerrar: () => void;
  onGuardada: (clave: string, estado: EstadoPoliza) => void;
}) {
  const [archivos, setArchivos] = React.useState<ArchivosRevision | null>(null);
  const [cargadoPara, setCargadoPara] = React.useState<string | null>(null);
  const revision = estado?.tipo === "revisar" ? estado : null;
  const clave = unidad?.clave ?? null;

  // Los documentos se vuelven a leer de la carpeta elegida al abrir la revisión.
  if (clave !== cargadoPara) {
    setCargadoPara(clave);
    setArchivos(null);
  }
  React.useEffect(() => {
    if (!unidad || !revision || !fuente) return;
    let vigente = true;
    const leer = async (ref: string) => {
      const blob = await leerDocumento(ref, fuente).catch(() => null);
      return blob ? { ref, archivo: await comoArchivo(blob, ref.split("::").at(-1) ?? ref) } : null;
    };
    void Promise.all([
      Promise.all(revision.documentos.map(leer)),
      revision.negociacion ? leer(revision.negociacion) : null,
      expedienteDe(unidad, fuente).catch(() => null),
    ]).then(([docs, negociacion, expediente]) => {
      if (!vigente) return;
      const documentos = docs.filter((d) => d !== null);
      const caratula = caratulaDe(documentos.map((d) => ({ ruta: d.ref, tamano: d.archivo.size, archivo: d.archivo })));
      setArchivos({
        documentos: negociacion ? [...documentos, negociacion] : documentos,
        caratula: caratula?.archivo ?? null,
        negociacion: negociacion?.archivo ?? null,
        expediente: expediente && "archivo" in expediente ? expediente.archivo : null,
        avisoExpediente: expediente && "omitido" in expediente ? expediente.omitido : null,
      });
    });
    return () => {
      vigente = false;
    };
    // Solo al abrir otra póliza: `revision` cambia de identidad con cada actualización de la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, fuente]);

  const abrir = (archivo: File) => {
    const url = URL.createObjectURL(archivo);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <Dialog open={unidad !== null && revision !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">Revisar «{unidad?.nombre}»</DialogTitle>
          <DialogDescription>
            Corrige lo que haga falta y guarda; la carátula
            {archivos?.negociacion && ", el formato de negociación"}
            {archivos?.expediente && " y el expediente (ZIP con todo lo de la póliza)"} se suben con ella.
          </DialogDescription>
        </DialogHeader>
        {revision && (
          <ul className="list-disc space-y-1 rounded-md border border-warning/30 bg-warning/10 py-2.5 pr-3 pl-7 text-xs text-warning">
            {revision.motivos.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {!fuente ? (
            <p className="text-xs text-muted-foreground">Elige de nuevo la carpeta para ver sus documentos.</p>
          ) : archivos === null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Abriendo documentos…
            </p>
          ) : (
            archivos.documentos.map((d) => (
              <Button key={d.ref} size="sm" variant="outline" className="h-7 max-w-full text-xs" onClick={() => abrir(d.archivo)}>
                <FileText /> <span className="truncate">{d.archivo.name}</span>
              </Button>
            ))
          )}
        </div>
        {archivos?.avisoExpediente && <p className="text-xs text-warning">{archivos.avisoExpediente}</p>}
        {unidad && revision && (
          <PolizaForm
            key={unidad.clave}
            inicial={revision.inicial}
            aseguradoras={aseguradoras}
            verComisiones={verComisiones}
            ejecutivos={ejecutivos}
            ejecutivoPredeterminado={ejecutivoPredeterminado}
            leidaConIa
            caratula={archivos?.caratula ?? null}
            negociacion={archivos?.negociacion ?? null}
            expediente={archivos?.expediente ?? null}
            onGuardada={(res) => {
              toast.success(`Póliza ${res.poliza.numero} guardada`);
              onGuardada(unidad.clave, {
                tipo: "guardada",
                polizaId: res.poliza.id,
                clienteId: res.cliente.id,
                cliente: res.cliente.nombre,
                rfc: revision.rfc,
                numero: res.poliza.numero,
              });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
