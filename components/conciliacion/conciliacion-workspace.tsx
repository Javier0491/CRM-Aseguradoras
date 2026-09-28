"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Columns3,
  FilePlus2,
  FileSpreadsheet,
  Loader2,
  ScanSearch,
  SearchX,
  Sparkles,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { analizarConciliacion, aplicarConciliacion } from "@/lib/conciliacion/actions";
import {
  adivinarMapeo,
  COLUMNAS_OPCIONALES,
  construirFilas,
  detectarEstructura,
  ESTADO_MAX_BYTES,
  EXTENSIONES_ESTADO,
  leerArchivoEstado,
  MAX_FILAS_ENCABEZADO,
  type Celda,
  type Hoja,
  type Mapeo,
} from "@/lib/conciliacion/archivo";
import {
  TOLERANCIA_MXN,
  type EstatusMatch,
  type ResultadoMatch,
  type ResumenMatch,
} from "@/lib/conciliacion/tipos";
import { formatFecha, formatMoneda, formatNumero } from "@/lib/format";
import type { Opcion } from "@/lib/polizas/ramos";
import { cn } from "@/lib/utils";

const estatusConfig: Record<EstatusMatch, { label: string; icono: LucideIcon; clase: string }> = {
  conciliado: { label: "Conciliado", icono: CheckCircle2, clase: "border-success/30 bg-success/10 text-success" },
  auto_creado: { label: "Auto-creado y Conciliado", icono: FilePlus2, clase: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
  diferencia: { label: "Diferencia", icono: CircleAlert, clase: "border-warning/30 bg-warning/10 text-warning" },
  no_encontrado: { label: "No encontrado", icono: SearchX, clase: "border-destructive/30 bg-destructive/10 text-destructive" },
  revisar: { label: "Revisar", icono: CircleHelp, clase: "border-border bg-muted text-muted-foreground" },
  ya_conciliado: { label: "Ya conciliado", icono: CheckCheck, clase: "border-border bg-muted/40 text-muted-foreground" },
};
const ORDEN_ESTATUS: EstatusMatch[] = ["conciliado", "auto_creado", "diferencia", "no_encontrado", "revisar", "ya_conciliado"];

const ETIQUETAS_COLUMNA = {
  poliza: "Columna de póliza *",
  comision: "Columna de comisión pagada *",
  recibo: "Columna de recibo (opcional)",
  folio: "Folio del recibo (opcional)",
  fecha: "Fecha / inicio del recibo (opcional)",
} as const;

/**
 * Cómo se llegó al mapeo actual: "auto" (se detectó una fila con póliza y comisión),
 * "sin_deteccion" (no se encontró; hay que elegir a mano) o "manual" (el usuario lo cambió).
 */
type OrigenMapeo = "auto" | "sin_deteccion" | "manual";
type Archivo = {
  nombre: string;
  hojas: Hoja[];
  hoja: number;
  encabezado: number;
  mapeo: Mapeo;
  origen: OrigenMapeo;
};

/** Encabezado y columnas detectados en una hoja, listos para el estado del archivo. */
function autoMapear(hoja: Hoja): Pick<Archivo, "encabezado" | "mapeo" | "origen"> {
  const { encabezado, mapeo, detectada } = detectarEstructura(hoja.filas);
  return { encabezado, mapeo, origen: detectada ? "auto" : "sin_deteccion" };
}
type Analisis = { resultados: ResultadoMatch[]; resumen: ResumenMatch };

const texto = (c: Celda | undefined) =>
  c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c);

export function ConciliacionWorkspace({
  aseguradoras,
  conEsquema,
}: {
  aseguradoras: Opcion[];
  /** Aseguradoras que tienen matriz de comisiones. */
  conEsquema: string[];
}) {
  const [aseguradora, setAseguradora] = React.useState("");
  const [archivo, setArchivo] = React.useState<Archivo | null>(null);
  const [leyendo, setLeyendo] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analisis, setAnalisis] = React.useState<Analisis | null>(null);
  const [analizando, startAnalisis] = React.useTransition();
  const [filtro, setFiltro] = React.useState<EstatusMatch | "todos">("todos");
  const [confirmar, setConfirmar] = React.useState(false);
  const [aplicando, startAplicar] = React.useTransition();
  const [aplicados, setAplicados] = React.useState<{ conciliados: number; pagados: number; creados: number } | null>(null);

  const hojaActual = archivo ? archivo.hojas[archivo.hoja] : null;
  const encabezados = hojaActual ? (hojaActual.filas[archivo!.encabezado] ?? []) : [];
  const conversion = React.useMemo(
    () => (archivo && hojaActual ? construirFilas(hojaActual.filas, archivo.encabezado, archivo.mapeo) : null),
    [archivo, hojaActual]
  );
  const listoParaAnalizar = Boolean(aseguradora && conversion && conversion.filas.length > 0);
  const nombreAseguradora = aseguradoras.find((a) => a.value === aseguradora)?.label;

  async function cargar(f: File) {
    setError(null);
    setAnalisis(null);
    setAplicados(null);
    if (!EXTENSIONES_ESTADO.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setError("Formato no soportado: usa un archivo CSV o Excel (.xlsx, .xls).");
      return;
    }
    if (f.size > ESTADO_MAX_BYTES) {
      setError("El archivo excede el límite de 10 MB.");
      return;
    }
    setLeyendo(true);
    try {
      const hojas = await leerArchivoEstado(f);
      // La primera hoja donde se detectan póliza y comisión (a veces la primera es un resumen);
      // si ninguna, la primera con datos.
      const conEncabezado = hojas.findIndex((h) => detectarEstructura(h.filas).detectada);
      const hoja = conEncabezado >= 0 ? conEncabezado : Math.max(0, hojas.findIndex((h) => h.filas.length > 0));
      if (!hojas[hoja]?.filas.length) throw new Error("vacío");
      setArchivo({ nombre: f.name, hojas, hoja, ...autoMapear(hojas[hoja]) });
    } catch (e) {
      console.error("[conciliacion] lectura", e);
      setArchivo(null);
      setError("No se pudo leer el archivo. Verifica que sea un CSV o Excel válido y que no esté vacío.");
    } finally {
      setLeyendo(false);
    }
  }

  function actualizarArchivo(cambios: Partial<Archivo>) {
    setArchivo((a) => (a ? { ...a, ...cambios } : a));
    setAnalisis(null);
    setAplicados(null);
  }

  function analizar() {
    if (!conversion) return;
    setError(null);
    setAplicados(null);
    startAnalisis(async () => {
      const res = await analizarConciliacion(aseguradora, conversion.filas);
      if (res.ok) {
        setAnalisis({ resultados: res.resultados, resumen: res.resumen });
        setFiltro("todos");
      } else {
        setError(res.error);
      }
    });
  }

  function aplicar() {
    if (!conversion) return;
    startAplicar(async () => {
      const res = await aplicarConciliacion(aseguradora, conversion.filas);
      setConfirmar(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // La tabla se conserva para ver qué se concilió y qué se auto-creó. Si se vuelve a
      // analizar, esos renglones salen como "Ya conciliado".
      setAplicados({ conciliados: res.conciliados, pagados: res.pagados, creados: res.creados });
    });
  }

  // Todo recibo que el estado de cuenta reporta cobrado avanza en su póliza al aplicar.
  const porAplicar = analisis
    ? analisis.resumen.conciliado + analisis.resumen.diferencia + analisis.resumen.auto_creado
    : 0;
  const visibles = analisis
    ? analisis.resultados.filter((r) => filtro === "todos" || r.estatus === filtro)
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Estado de cuenta de comisiones</CardTitle>
          <CardDescription>
            Elige la aseguradora y sube su estado de cuenta en CSV o Excel. El archivo se lee en tu
            navegador; solo se envían los renglones de póliza y comisión.
          </CardDescription>
          {archivo && (
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setArchivo(null);
                  setAnalisis(null);
                  setAplicados(null);
                  setError(null);
                }}
              >
                <X /> Quitar archivo
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="aseguradora">Aseguradora</Label>
              <Select
                value={aseguradora}
                onValueChange={(v) => {
                  setAseguradora(v);
                  setAnalisis(null);
                  setAplicados(null);
                }}
              >
                <SelectTrigger id="aseguradora" className="w-full">
                  <SelectValue placeholder="Selecciona la aseguradora" />
                </SelectTrigger>
                <SelectContent>
                  {aseguradoras.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {aseguradora && !conEsquema.includes(aseguradora) && (
                <p className="text-xs text-warning">
                  {nombreAseguradora} no tiene matriz de comisiones: sus renglones saldrán como &quot;Revisar&quot;
                  salvo las pólizas con % personalizado.
                </p>
              )}
            </div>
            <ZonaArchivo onArchivo={cargar} leyendo={leyendo} nombre={archivo?.nombre} />
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}

        </CardContent>
      </Card>

      {archivo && hojaActual && (
        <Card className="gap-0 border-primary/25 py-0">
          <CardHeader className="border-b border-primary/15 px-5 py-4 [.border-b]:pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Columns3 className="size-4" />
              </span>
              2. Mapeo de columnas
            </CardTitle>
            <CardDescription>
              Indica dónde están los encabezados y qué columnas traen la póliza y la comisión pagada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-5 py-5">
            <AvisoDeteccion archivo={archivo} encabezados={encabezados} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {archivo.hojas.length > 1 && (
                <SelectorColumna
                  label="Hoja"
                  valor={String(archivo.hoja)}
                  opciones={archivo.hojas.map((h, i) => ({ value: String(i), label: h.nombre }))}
                  onChange={(v) => {
                    const hoja = Number(v);
                    actualizarArchivo({ hoja, ...autoMapear(archivo.hojas[hoja]) });
                  }}
                />
              )}
              <SelectorColumna
                label="Fila de encabezados"
                valor={String(archivo.encabezado)}
                opciones={hojaActual.filas.slice(0, MAX_FILAS_ENCABEZADO).map((f, i) => ({
                  value: String(i),
                  label: `Fila ${i + 1}: ${f.map(texto).filter(Boolean).slice(0, 3).join(", ") || "(vacía)"}`,
                }))}
                onChange={(v) => {
                  const encabezado = Number(v);
                  // Las columnas se vuelven a proponer con los nombres de la fila elegida.
                  actualizarArchivo({ encabezado, mapeo: adivinarMapeo(hojaActual.filas[encabezado]), origen: "manual" });
                }}
              />
              {(["poliza", "comision", ...COLUMNAS_OPCIONALES] as const).map((clave) => (
                <SelectorColumna
                  key={clave}
                  // Mismo dorado que las columnas resaltadas en la vista previa.
                  usadaEnCruce
                  label={ETIQUETAS_COLUMNA[clave]}
                  valor={archivo.mapeo[clave] === null ? "" : String(archivo.mapeo[clave])}
                  opciones={[
                    ...((COLUMNAS_OPCIONALES as readonly string[]).includes(clave)
                      ? [{ value: "ninguna", label: "No usar" }]
                      : []),
                    ...encabezados.map((c, i) => ({ value: String(i), label: texto(c) || `Columna ${i + 1}` })),
                  ]}
                  onChange={(v) =>
                    actualizarArchivo({
                      mapeo: { ...archivo.mapeo, [clave]: v === "ninguna" ? null : Number(v) },
                      origen: "manual",
                    })
                  }
                />
              ))}
            </div>

            <VistaPrevia filas={hojaActual.filas} encabezado={archivo.encabezado} mapeo={archivo.mapeo} />

            {conversion && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground tabular-nums">{formatNumero(conversion.filas.length)}</strong>{" "}
                  renglones para cruzar
                </span>
                {conversion.omitidas.length > 0 && (
                  <details>
                    <summary className="cursor-pointer hover:text-foreground">
                      {conversion.omitidas.length} omitidos (totales, subtítulos o montos no numéricos)
                    </summary>
                    <ul className="mt-1 list-disc pl-5">
                      {conversion.omitidas.slice(0, 20).map((o) => (
                        <li key={`${o.fila}-${o.motivo}`}>
                          {o.fila > 0 ? `Fila ${o.fila}: ` : ""}
                          {o.motivo}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {conversion.agrupadas.length > 0 && (
                  <details open>
                    <summary className="cursor-pointer text-sky-400 hover:text-foreground">
                      {conversion.agrupadas.length}{" "}
                      {conversion.agrupadas.length === 1 ? "renglón repetía" : "renglones repetían"} el folio de otro y
                      se agruparon
                    </summary>
                    <ul className="mt-1 list-disc pl-5">
                      {conversion.agrupadas.slice(0, 20).map((o) => (
                        <li key={`${o.fila}-${o.motivo}`}>
                          Fila {o.fila}: {o.motivo}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t border-primary/15 px-5 py-4 [.border-t]:pt-4">
            <Button onClick={analizar} disabled={!listoParaAnalizar || analizando}>
              {analizando ? <Loader2 className="animate-spin" /> : <ScanSearch />}
              {analizando ? "Cruzando…" : "Analizar cruce"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {analisis && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
            <CardTitle className="text-base">3. Resultado del cruce · {nombreAseguradora}</CardTitle>
            <CardDescription>
              Comisión esperada = (prima neta anual ÷ número de recibos) × % de la póliza o de la matriz
              de comisiones (aseguradora, ramo y año de la póliza). Nunca sobre la prima total. Se
              considera que coincide con una diferencia de hasta {formatMoneda(TOLERANCIA_MXN)}.
            </CardDescription>
          </CardHeader>

          <div className="grid grid-cols-2 gap-3 border-b px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
            {ORDEN_ESTATUS.map((e) => {
              const c = estatusConfig[e];
              const activo = filtro === e;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setFiltro(activo ? "todos" : e)}
                  aria-pressed={activo}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                    activo && "border-primary/50 bg-accent/40"
                  )}
                >
                  <c.icono className={cn("size-5 shrink-0", c.clase.split(" ").find((k) => k.startsWith("text-")))} />
                  <span className="min-w-0">
                    <span className="block text-xl font-semibold tabular-nums">{analisis.resumen[e]}</span>
                    <span className="block text-xs leading-tight text-muted-foreground">{c.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-x-8 gap-y-1 border-b px-5 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Esperada · pagada</span>
              <span className="tabular-nums">
                {formatMoneda(analisis.resumen.esperada)} · {formatMoneda(analisis.resumen.pagada)}
              </span>
            </div>
            <div className="flex justify-between gap-2 font-medium">
              <span>Diferencia</span>
              <span className="tabular-nums">{formatMoneda(analisis.resumen.pagada - analisis.resumen.esperada)}</span>
            </div>
            <div className="flex justify-between gap-2 text-sky-400">
              <span title="Comisión pagada de los recibos que se auto-crean">Pagado en auto-creados</span>
              <span className="tabular-nums">{formatMoneda(analisis.resumen.pagadaAutoCreada)}</span>
            </div>
            <div className="flex justify-between gap-2 text-muted-foreground">
              <span title="Pagado en renglones no encontrados o por revisar">Pagado sin cruce</span>
              <span className="tabular-nums">{formatMoneda(analisis.resumen.pagadaSinCruce)}</span>
            </div>
          </div>

          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16 pl-5">Fila</TableHead>
                <TableHead>Póliza</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Recibo</TableHead>
                <TableHead className="text-right">Comisión esperada</TableHead>
                <TableHead className="text-right">Comisión pagada</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="pr-5">Estatus de match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((r) => {
                const c = estatusConfig[r.estatus];
                return (
                  <TableRow key={r.fila}>
                    <TableCell className="pl-5 text-xs text-muted-foreground tabular-nums">{r.fila}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.poliza ? (
                        <Link href={`/polizas/${r.poliza.id}`} className="hover:text-primary hover:underline">
                          {r.poliza.numeroImpreso}
                        </Link>
                      ) : (
                        r.polizaArchivo
                      )}
                      {r.poliza && r.poliza.numeroImpreso !== r.polizaArchivo && (
                        <p className="text-[11px] text-muted-foreground">archivo: {r.polizaArchivo}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {r.poliza?.cliente ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {r.recibo ? (
                        `${r.recibo.numero}/${r.recibo.total}`
                      ) : r.nuevoRecibo ? (
                        <span className="text-sky-400">{r.nuevoRecibo.numero} · nuevo</span>
                      ) : (
                        "—"
                      )}
                      {r.folio && <p className="font-mono text-[11px]">folio {r.folio}</p>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.comisionEsperada !== null ? formatMoneda(r.comisionEsperada) : "—"}
                      {r.porcentaje && r.base && (
                        <p className="text-[11px] text-muted-foreground">
                          {r.porcentaje.valor}% de {formatMoneda(r.base.primaNeta)} prima neta (÷{r.base.recibos}) ·{" "}
                          {r.porcentaje.origen === "personalizado"
                            ? "personalizado"
                            : r.porcentaje.anio === 1
                              ? "año 1"
                              : `renovación · año ${r.porcentaje.anio}`}
                          {r.porcentaje.anioPor === "antiguedad" && r.porcentaje.antiguedad && (
                            <span title="Año calculado con la fecha de antigüedad del titular">
                              {" "}
                              (antigüedad {formatFecha(`${r.porcentaje.antiguedad}T00:00:00Z`)})
                            </span>
                          )}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoneda(r.comisionPagada)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        r.diferencia !== null && Math.abs(r.diferencia) > TOLERANCIA_MXN ? "text-warning" : "text-muted-foreground"
                      )}
                    >
                      {r.diferencia === null ? "—" : `${r.diferencia > 0 ? "+" : ""}${formatMoneda(r.diferencia)}`}
                    </TableCell>
                    <TableCell className="pr-5">
                      <Badge variant="outline" className={cn("gap-1", c.clase)}>
                        <c.icono className="size-3" /> {c.label}
                      </Badge>
                      {r.detalle && <p className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">{r.detalle}</p>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibles.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No hay renglones con este estatus.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <CardFooter className="flex flex-wrap items-center gap-3 border-t px-5 py-4 [.border-t]:pt-4">
            <div className="mr-auto text-sm" aria-live="polite">
              {aplicados !== null ? (
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="size-4" /> {aplicados.conciliados}{" "}
                  {aplicados.conciliados === 1 ? "recibo conciliado" : "recibos conciliados"}
                  {aplicados.pagados > 0 &&
                    `, ${aplicados.pagados} ${aplicados.pagados === 1 ? "pagado" : "pagados"} con diferencia`}
                  {aplicados.creados > 0 &&
                    ` y ${aplicados.creados} ${aplicados.creados === 1 ? "auto-creado" : "auto-creados"}`}
                  .
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Se aplican los conciliados, los auto-creados y las diferencias (quedan como Pagado para
                  aclarar la comisión); no encontrados y por revisar no se modifican.
                </span>
              )}
            </div>
            <Button
              onClick={() => setConfirmar(true)}
              // Ya aplicado: para volver a aplicar hay que analizar de nuevo.
              disabled={porAplicar === 0 || aplicando || aplicados !== null}
            >
              <CheckCircle2 /> Aplicar Conciliación ({porAplicar})
            </Button>
          </CardFooter>
        </Card>
      )}

      <Dialog open={confirmar} onOpenChange={(v) => !aplicando && setConfirmar(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Aplicar la conciliación?</DialogTitle>
            <DialogDescription>
              Se marcarán como <strong>CONCILIADOS</strong> {analisis?.resumen.conciliado ?? 0} recibos de{" "}
              {nombreAseguradora}
              {(analisis?.resumen.auto_creado ?? 0) > 0 && (
                <>
                  {" "}y se <strong>crearán</strong> {analisis?.resumen.auto_creado} recibos que el estado de cuenta
                  reporta cobrados pero no existían (con monto estimado de la prima)
                </>
              )}
              .
              {(analisis?.resumen.diferencia ?? 0) > 0 && (
                <>
                  {" "}Los {analisis?.resumen.diferencia} recibos con diferencia se marcarán como <strong>PAGADOS</strong>:
                  cobrados, con la comisión por aclarar.
                </>
              )}{" "}
              Se guardará la comisión pagada y el folio de cada uno. Los no encontrados y los renglones por
              revisar no se modifican.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={aplicando}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={aplicar} disabled={aplicando}>
              {aplicando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {aplicando ? "Aplicando…" : "Aplicar conciliación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Explica qué hizo la auto-detección, para que el usuario solo tenga que confirmarlo. */
function AvisoDeteccion({ archivo, encabezados }: { archivo: Archivo; encabezados: Celda[] }) {
  if (archivo.origen === "manual") return null;
  if (archivo.origen === "sin_deteccion") {
    return (
      <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        No se encontró una fila con columnas de «Póliza» y «Comisión» en las primeras {MAX_FILAS_ENCABEZADO} filas.
        Elige la fila de encabezados y las columnas manualmente.
      </p>
    );
  }
  const nombre = (i: number | null) => (i === null ? "" : texto(encabezados[i]) || `Columna ${i + 1}`);
  return (
    <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/[0.07] px-3 py-2 text-sm">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        <span className="font-medium text-primary">Detectado automáticamente:</span> encabezados en la{" "}
        <strong>fila {archivo.encabezado + 1}</strong>
        {archivo.hojas.length > 1 && ` de la hoja «${archivo.hojas[archivo.hoja].nombre}»`}, póliza en «
        {nombre(archivo.mapeo.poliza)}» y comisión en «{nombre(archivo.mapeo.comision)}»
        {archivo.mapeo.recibo !== null && `, recibo en «${nombre(archivo.mapeo.recibo)}»`}
        {archivo.mapeo.folio !== null && `, folio en «${nombre(archivo.mapeo.folio)}»`}
        {archivo.mapeo.fecha !== null && `, fecha en «${nombre(archivo.mapeo.fecha)}»`}.{" "}
        <span className="text-muted-foreground">Revisa la vista previa; puedes cambiarlo abajo.</span>
      </span>
    </p>
  );
}

function SelectorColumna({
  label,
  valor,
  opciones,
  usadaEnCruce = false,
  onChange,
}: {
  label: string;
  valor: string;
  opciones: Opcion[];
  /** Columna que se usa en el cruce: se marca en dorado, como en la vista previa. */
  usadaEnCruce?: boolean;
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id} className="text-xs">
        {usadaEnCruce && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
        {label}
      </Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className={cn("w-full bg-card", usadaEnCruce && valor && "border-primary/40")}
        >
          <SelectValue placeholder="Selecciona…" />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Renglones de datos que se muestran en la vista previa (con scroll vertical). */
const FILAS_VISTA_PREVIA = 50;

function VistaPrevia({ filas, encabezado, mapeo }: { filas: Celda[][]; encabezado: number; mapeo: Mapeo }) {
  const columnas = filas[encabezado] ?? [];
  const datos = filas.slice(encabezado + 1, encabezado + 1 + FILAS_VISTA_PREVIA);
  const marcadas = new Set(Object.values(mapeo).filter((c): c is number => c !== null));
  return (
    <div className="overflow-hidden rounded-md border">
      {/* Scroll en ambos ejes dentro de la tarjeta: las columnas conservan su ancho sin aplastarse. */}
      <div className="max-h-[400px] overflow-auto">
        <table className="w-max min-w-full text-xs">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 border-b bg-card bg-linear-to-b from-muted/50 to-muted/50 px-3 py-2 text-right font-medium text-muted-foreground">
                #
              </th>
              {columnas.map((c, i) => (
                <th
                  key={i}
                  // Fondo opaco (card + muted/50) para que el encabezado fijo tape las filas al hacer scroll.
                  className={cn(
                    "sticky top-0 z-10 border-b bg-card bg-linear-to-b from-muted/50 to-muted/50 px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground",
                    marcadas.has(i) && "text-primary shadow-[inset_0_-2px_0_var(--primary)]"
                  )}
                >
                  {texto(c) || `Columna ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {datos.map((f, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                <td className="sticky left-0 z-[1] border-r bg-card px-3 py-1.5 text-right text-muted-foreground">
                  {encabezado + i + 2}
                </td>
                {columnas.map((_, j) => (
                  <td
                    key={j}
                    title={texto(f[j]) || undefined}
                    className={cn(
                      "max-w-[20rem] truncate px-3 py-1.5 whitespace-nowrap",
                      marcadas.has(j) && "bg-primary/5 text-foreground"
                    )}
                  >
                    {texto(f[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        Vista previa: {datos.length} de {formatNumero(Math.max(0, filas.length - encabezado - 1))} renglones. En
        dorado, las columnas que se usan en el cruce.
      </p>
    </div>
  );
}

function ZonaArchivo({
  onArchivo,
  leyendo,
  nombre,
}: {
  onArchivo: (f: File) => void;
  leyendo: boolean;
  nombre?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = React.useState(false);
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Archivo</span>
      <button
        type="button"
        disabled={leyendo}
        onClick={() => inputRef.current?.click()}
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
          "flex w-full items-center gap-3 rounded-lg border border-dashed bg-background/60 px-4 py-4 text-left transition-colors outline-none",
          "hover:border-primary/60 hover:bg-primary/[0.03] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40",
          arrastrando && "border-primary bg-primary/[0.06]"
        )}
      >
        {leyendo ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
        ) : nombre ? (
          <FileSpreadsheet className="size-5 shrink-0 text-primary" />
        ) : (
          <UploadCloud className="size-5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {leyendo ? "Leyendo archivo…" : nombre ?? (arrastrando ? "Suelta el archivo aquí" : "Arrastra el estado de cuenta o haz clic para seleccionar")}
          </span>
          <span className="block text-xs text-muted-foreground">
            {nombre ? "Haz clic para cambiar el archivo" : "CSV, XLSX o XLS · máximo 10 MB"}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArchivo(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
