"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  MailCheck,
  MailX,
  RefreshCw,
  Search,
  Send,
  UploadCloud,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ramoLabel } from "@/components/polizas/poliza-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leerCco, MAX_CCO } from "@/lib/comunicaciones/correo";
import { ESTADO_MAX_BYTES, leerArchivoEstado } from "@/lib/conciliacion/archivo";
import { formatFecha, formatMoneda, hoyISO } from "@/lib/format";
import {
  buscarPolizasPrevio,
  enviarAvisosPrevio,
  type PolizaPrevio,
  type ResultadoEnvioPrevio,
} from "@/lib/previo-cancelar/actions";
import { leerPrevioCancelar, type ArchivoPrevio, type RenglonPrevio } from "@/lib/previo-cancelar/excel";
import {
  fechaIsoValida,
  fechasPropuestas,
  mensajePrevioCancelar,
  mesDe,
  ramoAviso,
  TANDA_ENVIO_PREVIO,
} from "@/lib/previo-cancelar/mensaje";
import { cn } from "@/lib/utils";

type Estado = "listo" | "sin_correo" | "no_encontrada" | "cancelada" | "avisado";

type Fila = { renglon: RenglonPrevio; poliza: PolizaPrevio | null; estado: Estado };

const ESTADOS: Record<
  Estado,
  { etiqueta: string; corta: string; icono: LucideIcon; color: string; fondo: string; borde: string }
> = {
  listo: {
    etiqueta: "Listas para avisar",
    corta: "Lista para avisar",
    icono: MailCheck,
    color: "text-success",
    fondo: "bg-success/10",
    borde: "border-success/30",
  },
  avisado: {
    etiqueta: "Ya avisadas este mes",
    corta: "Ya avisada",
    icono: CheckCircle2,
    color: "text-primary",
    fondo: "bg-primary/10",
    borde: "border-primary/30",
  },
  sin_correo: {
    etiqueta: "Cliente sin correo",
    corta: "Sin correo",
    icono: MailX,
    color: "text-warning",
    fondo: "bg-warning/10",
    borde: "border-warning/30",
  },
  no_encontrada: {
    etiqueta: "No están en el CRM",
    corta: "No está en el CRM",
    icono: Search,
    color: "text-destructive",
    fondo: "bg-destructive/10",
    borde: "border-destructive/30",
  },
  cancelada: {
    etiqueta: "Ya canceladas",
    corta: "Cancelada en el CRM",
    icono: Ban,
    color: "text-muted-foreground",
    fondo: "bg-muted",
    borde: "border-border",
  },
};
const ORDEN: Estado[] = ["listo", "avisado", "sin_correo", "no_encontrada", "cancelada"];

function estadoDe(poliza: PolizaPrevio | null): Estado {
  if (!poliza) return "no_encontrada";
  if (poliza.cancelada) return "cancelada";
  if (poliza.avisado) return "avisado";
  return poliza.email ? "listo" : "sin_correo";
}

/** Archivo ya leído y cruzado con la cartera (solo la galería de desarrollo lo usa). */
export type PrevioInicial = { nombre: string; datos: ArchivoPrevio; polizas: PolizaPrevio[] };

export function PrevioCancelar({
  remitente,
  correoContacto,
  inicial,
}: {
  remitente: string | null;
  correoContacto: string | null;
  inicial?: PrevioInicial;
}) {
  const [archivo, setArchivo] = React.useState<{ nombre: string; datos: ArchivoPrevio } | null>(
    inicial ? { nombre: inicial.nombre, datos: inicial.datos } : null
  );
  const [polizas, setPolizas] = React.useState<Map<string, PolizaPrevio>>(
    () => new Map(inicial?.polizas.map((p) => [p.numero, p]))
  );
  const [leyendo, setLeyendo] = React.useState(false);
  const [buscando, setBuscando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const propuestas = React.useMemo(() => fechasPropuestas(hoyISO()), []);
  const [ventanilla, setVentanilla] = React.useState(propuestas.ventanilla);
  const [portal, setPortal] = React.useState(propuestas.portal);
  const [cco, setCco] = React.useState("");
  const [filtro, setFiltro] = React.useState<Estado | null>(null);
  const [seleccion, setSeleccion] = React.useState<Set<string>>(
    () => new Set(inicial?.polizas.filter((p) => estadoDe(p) === "listo").map((p) => p.numero))
  );
  const [vista, setVista] = React.useState<string | null>(null);
  const [resultados, setResultados] = React.useState<Map<string, ResultadoEnvioPrevio>>(new Map());
  const [progreso, setProgreso] = React.useState<{ hechos: number; total: number } | null>(null);
  const [confirmar, setConfirmar] = React.useState(false);

  const fechasOk = fechaIsoValida(ventanilla) && fechaIsoValida(portal);
  const ocultas = leerCco(cco);
  const errorCco =
    ocultas.invalidos.length > 0
      ? `Correo inválido: ${ocultas.invalidos[0]}`
      : ocultas.correos.length > MAX_CCO
        ? `Máximo ${MAX_CCO} correos.`
        : null;

  const filas: Fila[] = React.useMemo(
    () =>
      (archivo?.datos.renglones ?? []).map((renglon) => {
        const poliza = polizas.get(renglon.poliza) ?? null;
        return { renglon, poliza, estado: estadoDe(poliza) };
      }),
    [archivo, polizas]
  );
  const conteo = React.useMemo(() => {
    const c = Object.fromEntries(ORDEN.map((e) => [e, 0])) as Record<Estado, number>;
    for (const f of filas) c[f.estado]++;
    return c;
  }, [filas]);
  const visibles = filtro ? filas.filter((f) => f.estado === filtro) : filas;
  const seleccionables = filas.filter((f) => f.estado === "listo");
  const elegidas = seleccionables.filter((f) => seleccion.has(f.renglon.poliza));
  const filaVista = filas.find((f) => f.renglon.poliza === vista && f.poliza) ?? elegidas[0] ?? seleccionables[0] ?? null;

  // Busca las pólizas del archivo en la cartera; al cambiar de mes, vuelve a marcar las ya avisadas.
  const buscar = React.useCallback(
    async (datos: ArchivoPrevio, fecha: string, seleccionarListas: boolean) => {
      setBuscando(true);
      try {
        const r = await buscarPolizasPrevio(
          datos.renglones.map((x) => x.poliza),
          fecha
        );
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const mapa = new Map(r.polizas.map((p) => [p.numero, p]));
        setPolizas(mapa);
        if (seleccionarListas) {
          setSeleccion(
            new Set(datos.renglones.filter((x) => estadoDe(mapa.get(x.poliza) ?? null) === "listo").map((x) => x.poliza))
          );
        }
      } catch (e) {
        console.error(e);
        setError("No se pudo buscar las pólizas. Intenta de nuevo.");
      } finally {
        setBuscando(false);
      }
    },
    []
  );

  const mesBuscado = React.useRef<string | null>(inicial ? propuestas.ventanilla.slice(0, 7) : null);
  React.useEffect(() => {
    if (!archivo || !fechaIsoValida(ventanilla)) return;
    const mes = ventanilla.slice(0, 7);
    if (mesBuscado.current === mes) return;
    const primera = mesBuscado.current === null;
    mesBuscado.current = mes;
    void buscar(archivo.datos, ventanilla, primera);
  }, [archivo, ventanilla, buscar]);

  async function abrir(f: File) {
    setError(null);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setError("Sube el Excel de la aseguradora (XLSX, XLS o CSV).");
      return;
    }
    if (f.size > ESTADO_MAX_BYTES) {
      setError("El archivo pesa más de 10 MB.");
      return;
    }
    setLeyendo(true);
    try {
      const datos = leerPrevioCancelar(await leerArchivoEstado(f));
      if (typeof datos === "string") {
        setError(datos);
        return;
      }
      mesBuscado.current = null;
      setPolizas(new Map());
      setResultados(new Map());
      setSeleccion(new Set());
      setFiltro(null);
      setVista(null);
      setArchivo({ nombre: f.name, datos });
    } catch (e) {
      console.error(e);
      setError("No se pudo leer el archivo. ¿Está abierto en Excel o dañado?");
    } finally {
      setLeyendo(false);
    }
  }

  function alternar(poliza: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(poliza)) n.delete(poliza);
      else n.add(poliza);
      return n;
    });
  }

  async function enviar() {
    setConfirmar(false);
    const lista = elegidas.filter((f) => f.poliza);
    setProgreso({ hechos: 0, total: lista.length });
    let enviados = 0;
    let fallidos = 0;
    for (let i = 0; i < lista.length; i += TANDA_ENVIO_PREVIO) {
      const tanda = lista.slice(i, i + TANDA_ENVIO_PREVIO);
      let r: Awaited<ReturnType<typeof enviarAvisosPrevio>>;
      try {
        r = await enviarAvisosPrevio(
          tanda.map((f) => ({ polizaId: f.poliza!.polizaId, referencia: f.renglon.referencia || undefined })),
          { ventanilla, portal },
          ocultas.correos.join(", ")
        );
      } catch (e) {
        console.error(e);
        r = { ok: false, error: "Se perdió la conexión con el servidor." };
      }
      const nuevos: ResultadoEnvioPrevio[] = r.ok
        ? r.resultados
        : tanda.map((f) => ({ polizaId: f.poliza!.polizaId, ok: false as const, error: r.ok ? "" : r.error }));
      enviados += nuevos.filter((x) => x.ok).length;
      fallidos += nuevos.filter((x) => !x.ok).length;
      setResultados((m) => new Map([...m, ...nuevos.map((x) => [x.polizaId, x] as const)]));
      setProgreso({ hechos: Math.min(i + tanda.length, lista.length), total: lista.length });
    }
    setProgreso(null);
    if (enviados > 0) toast.success(`Se envió el aviso a ${enviados} ${enviados === 1 ? "cliente" : "clientes"}.`);
    if (fallidos > 0) toast.error(`${fallidos} ${fallidos === 1 ? "aviso no salió" : "avisos no salieron"}. Revisa el detalle en la lista.`);
    // Las que salieron quedan como "ya avisadas".
    if (archivo) {
      mesBuscado.current = ventanilla.slice(0, 7);
      await buscar(archivo.datos, ventanilla, false);
      setSeleccion(new Set());
    }
  }

  if (!archivo) {
    return <ZonaArchivo leyendo={leyendo} error={error} onArchivo={abrir} />;
  }

  const enviando = progreso !== null;
  const preview =
    filaVista?.poliza &&
    fechasOk &&
    mensajePrevioCancelar({
      ramo: ramoAviso(filaVista.poliza.ramo),
      poliza: filaVista.poliza.polizaVigor || filaVista.poliza.numeroImpreso,
      aseguradora: filaVista.poliza.aseguradora,
      fechaVentanilla: ventanilla,
      fechaPortal: portal,
      referencia: filaVista.renglon.referencia || undefined,
      correoContacto: correoContacto ?? undefined,
    });

  return (
    <div className="space-y-6">
      {/* Archivo cargado */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <FileSpreadsheet className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={archivo.nombre}>
            {archivo.nombre}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {archivo.datos.titulo || "Previo a cancelar"} · {filas.length} {filas.length === 1 ? "póliza" : "pólizas"}
            {archivo.datos.ramo && ` · ${archivo.datos.ramo === "GMM" ? "Gastos médicos" : "Vida"}`}
          </p>
        </div>
        {buscando && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Buscando en tu cartera…
          </span>
        )}
        <Button variant="outline" size="sm" disabled={enviando} onClick={() => setArchivo(null)}>
          <RefreshCw /> Cambiar archivo
        </Button>
      </div>

      {error && <Aviso>{error}</Aviso>}

      {/* Resumen: cada tarjeta filtra la lista */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TarjetaResumen
          etiqueta="En el archivo"
          valor={filas.length}
          icono={FileSpreadsheet}
          color="text-foreground"
          fondo="bg-muted"
          activa={filtro === null}
          onClick={() => setFiltro(null)}
        />
        {ORDEN.map((e) => (
          <TarjetaResumen
            key={e}
            etiqueta={ESTADOS[e].etiqueta}
            valor={conteo[e]}
            icono={ESTADOS[e].icono}
            color={ESTADOS[e].color}
            fondo={ESTADOS[e].fondo}
            activa={filtro === e}
            onClick={() => setFiltro(filtro === e ? null : e)}
          />
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Lista de pólizas */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {filtro ? ESTADOS[filtro].etiqueta : "Todas las pólizas"}{" "}
              <span className="text-muted-foreground">({visibles.length})</span>
            </h3>
            {seleccionables.length > 0 && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={enviando}
                  onClick={() => setSeleccion(new Set(seleccionables.map((f) => f.renglon.poliza)))}
                >
                  Seleccionar listas
                </Button>
                <Button variant="ghost" size="sm" disabled={enviando} onClick={() => setSeleccion(new Set())}>
                  Quitar selección
                </Button>
              </div>
            )}
          </div>
          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay pólizas en este grupo.
            </p>
          ) : (
            <ul className="space-y-2">
              {visibles.map((f) => (
                <TarjetaPoliza
                  key={f.renglon.poliza}
                  fila={f}
                  seleccionada={seleccion.has(f.renglon.poliza)}
                  enVista={filaVista?.renglon.poliza === f.renglon.poliza}
                  resultado={f.poliza ? resultados.get(f.poliza.polizaId) : undefined}
                  bloqueado={enviando || buscando}
                  onAlternar={() => alternar(f.renglon.poliza)}
                  onVer={() => setVista(f.renglon.poliza)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Panel de envío */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <div className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" />
              <h3 className="text-sm font-medium">Fechas límite de pago</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="previo-ventanilla" className="text-xs">
                  Ventanilla bancaria
                </Label>
                <Input
                  id="previo-ventanilla"
                  type="date"
                  value={ventanilla}
                  disabled={enviando}
                  onChange={(e) => setVentanilla(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="previo-portal" className="text-xs">
                  Portal de la aseguradora
                </Label>
                <Input
                  id="previo-portal"
                  type="date"
                  value={portal}
                  disabled={enviando}
                  onChange={(e) => setPortal(e.target.value)}
                />
              </div>
            </div>
            {fechaIsoValida(ventanilla) && (
              <p className="text-xs text-muted-foreground">
                Se avisa la cancelación del mes de <span className="font-medium text-foreground">{mesDe(ventanilla)}</span>. Cada
                póliza recibe un solo aviso por mes.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="previo-cco" className="text-xs">
                CCO (copia oculta, opcional)
              </Label>
              <Input
                id="previo-cco"
                value={cco}
                disabled={enviando}
                maxLength={1000}
                inputMode="email"
                autoComplete="off"
                placeholder="correo@ejemplo.com, otro@ejemplo.com"
                aria-invalid={errorCco ? true : undefined}
                onChange={(e) => setCco(e.target.value)}
              />
              <p className={cn("text-xs", errorCco ? "text-destructive" : "text-muted-foreground")}>
                {errorCco ?? "Reciben copia de cada aviso sin que el cliente lo vea."}
              </p>
            </div>

            {progreso ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Enviando avisos…</span>
                  <span>
                    {progreso.hechos} de {progreso.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${(progreso.hechos / Math.max(progreso.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <Button
                className="w-full"
                size="lg"
                disabled={elegidas.length === 0 || !fechasOk || Boolean(errorCco) || buscando || !remitente}
                onClick={() => setConfirmar(true)}
              >
                <Send />
                {elegidas.length === 0
                  ? "Selecciona pólizas para avisar"
                  : `Enviar aviso a ${elegidas.length} ${elegidas.length === 1 ? "cliente" : "clientes"}`}
              </Button>
            )}
            {!remitente && (
              <p className="text-xs text-warning">El envío de correos no está configurado en la plataforma.</p>
            )}
          </div>

          {/* Vista previa */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <div className="border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              Vista previa{filaVista?.poliza ? ` · ${filaVista.poliza.cliente.nombre}` : ""}
            </div>
            {preview && filaVista?.poliza ? (
              <div className="space-y-3 p-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Para:</span> {filaVista.poliza.email ?? "sin correo"}
                </p>
                <p className="font-medium">{preview.asunto}</p>
                <div className="space-y-2 rounded-lg border-l-4 border-primary bg-primary/5 p-3 text-[13px] leading-relaxed">
                  <p className="font-medium">Hola, {filaVista.poliza.cliente.nombre}:</p>
                  {preview.mensaje.split("\n").map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {remitente && <p className="text-xs text-muted-foreground">De: {remitente}</p>}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {fechasOk ? "Elige una póliza de la lista para ver su aviso." : "Revisa las fechas límite."}
              </p>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Enviar el aviso de previo a cancelar?</DialogTitle>
            <DialogDescription>
              Se enviará un correo individual a {elegidas.length} {elegidas.length === 1 ? "cliente" : "clientes"} para pagar a
              más tardar el {fechaIsoValida(ventanilla) ? formatFecha(`${ventanilla}T12:00:00`) : ventanilla} en ventanilla o el{" "}
              {fechaIsoValida(portal) ? formatFecha(`${portal}T12:00:00`) : portal} en el portal
              {ocultas.correos.length > 0 && `, con copia oculta a ${ocultas.correos.join(", ")}`}. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={enviar}>
              <Send /> Enviar {elegidas.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

/** Zona para soltar el Excel, con los tres pasos del proceso. */
function ZonaArchivo({
  leyendo,
  error,
  onArchivo,
}: {
  leyendo: boolean;
  error: string | null;
  onArchivo: (f: File) => void;
}) {
  const entrada = React.useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = React.useState(false);
  const pasos: { icono: LucideIcon; titulo: string; texto: string }[] = [
    { icono: UploadCloud, titulo: "Sube el Excel", texto: "El reporte «Previo a cancelar» que manda la aseguradora." },
    { icono: Search, titulo: "Lo cruzamos con tu cartera", texto: "Cada póliza se busca por su póliza vigor o su número." },
    { icono: Send, titulo: "Avisa a tus clientes", texto: "Un correo con las fechas límite de pago, con tu marca." },
  ];

  return (
    <div className="space-y-6">
      <button
        type="button"
        disabled={leyendo}
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = e.dataTransfer.files[0];
          if (f) onArchivo(f);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          "hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          arrastrando ? "border-primary bg-primary/10" : "border-border bg-card"
        )}
      >
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {leyendo ? <Loader2 className="size-8 animate-spin" /> : <FileSpreadsheet className="size-8" />}
        </span>
        <span className="text-lg font-semibold">
          {leyendo ? "Leyendo el archivo…" : arrastrando ? "Suelta el Excel aquí" : "Arrastra aquí el Excel de previo a cancelar"}
        </span>
        <span className="text-sm text-muted-foreground">o haz clic para elegirlo · XLSX, XLS o CSV</span>
      </button>
      <input
        ref={entrada}
        type="file"
        hidden
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onArchivo(f);
        }}
      />
      {error && <Aviso>{error}</Aviso>}
      <ol className="grid gap-3 sm:grid-cols-3">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="flex gap-3 rounded-xl border bg-card p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              {i + 1}
            </span>
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <p.icono className="size-4 text-primary" /> {p.titulo}
              </p>
              <p className="text-xs text-muted-foreground">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TarjetaResumen({
  etiqueta,
  valor,
  icono: Icono,
  color,
  fondo,
  activa,
  onClick,
}: {
  etiqueta: string;
  valor: number;
  icono: LucideIcon;
  color: string;
  fondo: string;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:bg-accent/50",
        activa && "ring-2 ring-primary/40"
      )}
    >
      <span className={cn("flex size-8 items-center justify-center rounded-lg", fondo, color)}>
        <Icono className="size-4" />
      </span>
      <span className="text-2xl font-semibold tabular-nums">{valor}</span>
      <span className="text-xs leading-tight text-muted-foreground">{etiqueta}</span>
    </button>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{etiqueta}</dt>
      <dd className="truncate text-sm">{valor || "—"}</dd>
    </div>
  );
}

function TarjetaPoliza({
  fila: { renglon, poliza, estado },
  seleccionada,
  enVista,
  resultado,
  bloqueado,
  onAlternar,
  onVer,
}: {
  fila: Fila;
  seleccionada: boolean;
  enVista: boolean;
  resultado: ResultadoEnvioPrevio | undefined;
  bloqueado: boolean;
  onAlternar: () => void;
  onVer: () => void;
}) {
  const e = ESTADOS[estado];
  const seleccionable = estado === "listo";
  const recibo = renglon.reciboSubsecuente || renglon.primerRecibo;

  return (
    <li
      className={cn(
        "rounded-xl border-l-4 border bg-card shadow-xs transition-shadow",
        e.borde,
        enVista && "ring-2 ring-primary/30"
      )}
    >
      <div className="flex gap-3 p-4">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-[var(--primary)] disabled:opacity-40"
          checked={seleccionable && seleccionada}
          disabled={!seleccionable || bloqueado}
          onChange={onAlternar}
          aria-label={`Avisar la póliza ${renglon.poliza}`}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <button type="button" onClick={onVer} className="min-w-0 text-left" disabled={!poliza}>
              <p className="font-mono text-base font-semibold">{renglon.poliza}</p>
              <p className="truncate text-sm text-muted-foreground" title={renglon.contratante}>
                {renglon.contratante || "Sin contratante en el archivo"}
              </p>
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              {poliza && (
                <Badge variant="outline" className="font-normal">
                  {ramoLabel[poliza.ramo]} · {poliza.aseguradora}
                </Badge>
              )}
              <Badge variant="outline" className={cn("gap-1 font-medium", e.color, e.fondo, e.borde)}>
                <e.icono className="size-3" /> {e.corta}
              </Badge>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Dato etiqueta="Forma de pago" valor={renglon.formaPago} />
            <Dato etiqueta="Conducto" valor={renglon.conducto} />
            <Dato
              etiqueta="Pagado hasta"
              valor={renglon.pagadoHasta ? formatFecha(`${renglon.pagadoHasta}T12:00:00`) : "Sin pagos"}
            />
            <Dato etiqueta="Recibo" valor={recibo ? formatMoneda(recibo) : null} />
          </dl>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm">
            {poliza ? (
              <>
                <Link href={`/clientes/${poliza.cliente.id}`} className="font-medium hover:underline">
                  {poliza.cliente.nombre}
                </Link>
                {poliza.email ? (
                  <span className="text-muted-foreground">{poliza.email}</span>
                ) : (
                  <Link href={`/clientes/${poliza.cliente.id}`} className="text-warning hover:underline">
                    Agregar correo al cliente
                  </Link>
                )}
                <Link href={`/polizas/${poliza.polizaId}`} className="ml-auto text-xs text-primary hover:underline">
                  Ver póliza
                </Link>
              </>
            ) : (
              <span className="text-muted-foreground">
                No hay una póliza con este número en tu cartera. Revisa si falta capturarla.
              </span>
            )}
          </div>

          {poliza?.avisado && !resultado && (
            <p className="text-xs text-primary">
              Avisada el {formatFecha(poliza.avisado.fecha)} a {poliza.avisado.destinatario}
            </p>
          )}
          {resultado && (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                resultado.ok ? "text-success" : "text-destructive"
              )}
            >
              {resultado.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
              {resultado.ok ? `Aviso enviado a ${resultado.email}` : resultado.error}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
