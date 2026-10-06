import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Download,
  ExternalLink,
  FileArchive,
  FilePenLine,
  FileText,
  FolderOpen,
  ListTodo,
  Pencil,
  RefreshCcw,
} from "lucide-react";

import { ArchivoUploader } from "@/components/archivos/archivo-uploader";
import { BarraAccionesMovil } from "@/components/layout/barra-acciones-movil";
import { EliminarEndoso } from "@/components/polizas/eliminar-endoso";
import { EliminarPoliza } from "@/components/polizas/eliminar-poliza";
import { GestionPoliza } from "@/components/polizas/gestion-poliza";
import { HistorialPoliza } from "@/components/polizas/historial-poliza";
import { PrimaNeta } from "@/components/polizas/prima-neta";
import {
  AseguradoraTag,
  EstadoVigenciaBadge,
  esCobrado,
  estadoRecibo,
  estadoVigencia,
  formaPagoLabel,
  ramoLabel,
  Vencimiento,
} from "@/components/polizas/poliza-ui";
import { MoverEtapa } from "@/components/renovaciones/mover-etapa";
import { ListaTareas } from "@/components/tareas/lista-tareas";
import { NuevaTarea } from "@/components/tareas/nueva-tarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAgencia } from "@/lib/agencias/queries";
import {
  ARCHIVOS,
  COLUMNAS_ARCHIVO,
  formatBytes,
  TIPOS_ARCHIVO,
  type TipoArchivo,
} from "@/lib/archivos/config";
import { requireUser, veComisiones } from "@/lib/auth/dal";
import { getHistorialPoliza, LIMITE_HISTORIAL } from "@/lib/bitacora/historial-poliza";
import { formatFecha, formatMoneda, formatNumero, hoyISO } from "@/lib/format";
import type { EstadoRecibo } from "@/lib/generated/prisma/client";
import { parentescoLabels, type Parentesco } from "@/lib/polizas/asegurados";
import { CAMPOS_LISTA_COBERTURAS, listaDeCoberturas } from "@/lib/polizas/coberturas";
import { etiquetaEndoso } from "@/lib/polizas/estatus";
import { getPolizaAnterior, getRenovacion } from "@/lib/polizas/formulario";
import { DIAS_POR_VENCER, getPolizaDetalle } from "@/lib/polizas/queries";
import { ramoDesdeDb, seccionesPorRamo, SUMA_ASEGURADA, TEXTO_SUMA_ILIMITADA, type CampoDef } from "@/lib/polizas/ramos";
import { COLUMNAS_EMBUDO, columnaDe } from "@/lib/renovaciones/reglas";
import { getTareasDe } from "@/lib/tareas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Detalle de póliza",
};

/** Dato de contacto que no se capturó: se resalta para completarlo. */
function SinDato({ children }: { children: React.ReactNode }) {
  return <span className="font-sans font-medium text-warning">{children}</span>;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function PolizaDetallePage({ params }: PageProps<"/polizas/[id]">) {
  const { id } = await params;
  const poliza = await getPolizaDetalle(id);
  if (!poliza) notFound();
  const hoy = hoyISO();
  const user = await requireUser();
  // La comisión solo la ve el SUPERADMIN.
  const verComisiones = veComisiones(user);
  const [renovada, anterior, historial, tareas, ejecutivos, agencia] = await Promise.all([
    getRenovacion(poliza),
    getPolizaAnterior(poliza),
    getHistorialPoliza(poliza, verComisiones),
    getTareasDe({ polizaId: poliza.id }),
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
    getAgencia(user.agenciaId),
  ]);
  const cancelada = poliza.canceladaAt !== null;
  const estado = estadoVigencia(poliza.vigencia_fin, hoy, DIAS_POR_VENCER, poliza.canceladaAt);
  // "Renovar" se destaca cuando la póliza está por vencer o ya venció.
  const toca = estado === "por_vencer" || estado === "vencida";
  const etapa = COLUMNAS_EMBUDO.find(
    (c) => c.clave === columnaDe({ renovada: renovada !== null, etapa: poliza.renovacionEtapa })
  );
  const primaEndosos = poliza.endosos.reduce((s, e) => s + (e.prima === null ? 0 : Number(e.prima)), 0);
  const conPrimaEndosos = poliza.endosos.some((e) => e.prima !== null);

  const datos: { label: string; valor: React.ReactNode; mono?: boolean }[] = [
    {
      label: "Cliente",
      valor: (
        <Link href={`/clientes/${poliza.cliente.id}`} className="hover:text-primary hover:underline">
          {poliza.cliente.nombre}
        </Link>
      ),
    },
    { label: "RFC", valor: poliza.cliente.rfc, mono: true },
    { label: "Teléfono", valor: poliza.cliente.telefono || <SinDato>Falta teléfono</SinDato>, mono: true },
    { label: "Correo", valor: poliza.cliente.email || <SinDato>Falta correo · complétalo en Editar</SinDato> },
    { label: "Vigencia", valor: `${formatFecha(poliza.vigencia_inicio)} – ${formatFecha(poliza.vigencia_fin)}` },
    { label: "Ejecutivo", valor: poliza.ejecutivo?.nombre ?? <span className="text-muted-foreground">Sin asignar</span> },
    { label: "Prima total", valor: formatMoneda(Number(poliza.prima_total)) },
    {
      label: "Prima neta",
      valor: (
        <PrimaNeta polizaId={poliza.id} valor={poliza.prima_neta === null ? null : Number(poliza.prima_neta)} />
      ),
    },
    ...(conPrimaEndosos
      ? [
          {
            label: "Prima con endosos",
            valor: `${formatMoneda(Number(poliza.prima_total) + primaEndosos)} (${primaEndosos < 0 ? "−" : "+"}${formatMoneda(Math.abs(primaEndosos))})`,
          },
        ]
      : []),
    { label: "Forma de pago", valor: formaPagoLabel[poliza.forma_pago] },
    ...(verComisiones
      ? [
          {
            label: "Comisión",
            valor:
              poliza.comision_personalizada_pct !== null
                ? `${Number(poliza.comision_personalizada_pct)}% (personalizada)`
                : "Según la matriz de comisiones",
          },
        ]
      : []),
    { label: "Registrada", valor: formatFecha(poliza.created_at) },
  ];

  const mensajeCliente =
    `Hola ${poliza.cliente.nombre}, le escribimos de ${agencia.nombre} sobre su póliza ${poliza.numeroImpreso} ` +
    `de ${poliza.aseguradora.nombre}.`;

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/polizas">
            <ArrowLeft /> Pólizas
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-semibold tracking-tight">{poliza.numeroImpreso}</h1>
              <EstadoVigenciaBadge
                fin={poliza.vigencia_fin}
                hoy={hoy}
                diasAviso={DIAS_POR_VENCER}
                cancelada={poliza.canceladaAt}
              />
              {!cancelada && etapa && etapa.clave !== "por_renovar" && etapa.clave !== "renovada" && (
                <Badge
                  variant="outline"
                  className={cn(etapa.clave === "perdida" && "border-destructive/40 text-destructive")}
                >
                  Renovación: {etapa.titulo}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm">
              <Link href={`/clientes/${poliza.cliente.id}`} className="font-medium hover:text-primary hover:underline">
                {poliza.cliente.nombre}
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              Póliza vigor <span className="font-mono text-primary">{poliza.polizaVigor ?? "—"}</span>
              {anterior && (
                <>
                  {" · "}renueva a{" "}
                  <Link href={`/polizas/${anterior.id}`} className="font-mono text-primary hover:underline">
                    {anterior.numeroImpreso}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <AseguradoraTag nombre={poliza.aseguradora.nombre} color={poliza.aseguradora.color_hex} />
            <Badge variant="outline">{ramoLabel[poliza.ramo]}</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/polizas/${poliza.id}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
            {renovada ? (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link href={`/polizas/${renovada.id}`} title="Esta póliza ya se renovó">
                  Renovada: <span className="font-mono">{renovada.numeroImpreso}</span> <ArrowRight />
                </Link>
              </Button>
            ) : (
              !cancelada && (
                <>
                  <Button asChild variant={toca ? "default" : "outline"} size="sm">
                    <Link href={`/captura?renovar=${poliza.id}`}>
                      <RefreshCcw /> Renovar
                    </Link>
                  </Button>
                  {etapa && <MoverEtapa polizaId={poliza.id} numero={poliza.numeroImpreso} actual={etapa.clave} />}
                </>
              )
            )}
            <GestionPoliza
              polizaId={poliza.id}
              numero={poliza.numeroImpreso}
              cancelada={cancelada}
              vigencia={{ inicio: iso(poliza.vigencia_inicio), fin: iso(poliza.vigencia_fin) }}
              hoy={hoy}
              recibosPendientes={poliza.recibos.filter((r) => r.estado === "PENDIENTE").length}
              recibosCancelados={poliza.recibos.filter((r) => r.estado === "CANCELADO").length}
            />
            <EliminarPoliza
              polizaId={poliza.id}
              numero={poliza.numeroImpreso}
              recibos={poliza.recibos.length}
              conciliados={poliza.recibos.filter((r) => r.estado === "CONCILIADO").length}
              asegurados={poliza.asegurados.length}
              archivos={[poliza.caratula_nombre, poliza.negociacion_nombre, poliza.expediente_nombre].filter(
                (n): n is string => Boolean(n)
              )}
            />
          </div>
        </div>
      </div>

      {cancelada && poliza.canceladaAt && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-destructive">Póliza cancelada desde el {formatFecha(poliza.canceladaAt)}</p>
            {poliza.motivoCancelacion && <p className="text-muted-foreground">{poliza.motivoCancelacion}</p>}
            <p className="text-xs text-muted-foreground">
              Sus recibos pendientes ya no se cobran. Para deshacerlo usa «Más → Reactivar póliza».
            </p>
          </div>
        </div>
      )}
      {!cancelada && poliza.renovacionEtapa === "PERDIDA" && !renovada && poliza.renovacionNota && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-destructive">Renovación perdida:</span> {poliza.renovacionNota}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de la póliza</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {datos.map((d) => (
                  <div key={d.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{d.label}</dt>
                    <dd className={cn("text-sm font-medium", typeof d.valor === "string" && "truncate", d.mono && "font-mono")}>
                      {d.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <DatosRamo ramo={poliza.ramo} datos={poliza.datos_ramo} sumaIlimitada={poliza.sumaAseguradaIlimitada} />

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base">Asegurados · {poliza.asegurados.length}</CardTitle>
            </CardHeader>
            {poliza.asegurados.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Sin asegurados registrados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Nombre</TableHead>
                    <TableHead>Parentesco</TableHead>
                    <TableHead>Sexo</TableHead>
                    <TableHead className="text-right">Edad</TableHead>
                    <TableHead>Nacimiento</TableHead>
                    <TableHead className="pr-5">Antigüedad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poliza.asegurados.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-5 font-medium">{a.nombre}</TableCell>
                      <TableCell>
                        {parentescoLabels[a.parentesco as Parentesco] ?? a.parentesco}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.sexo ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.edad ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {a.fecha_nacimiento ? formatFecha(`${a.fecha_nacimiento}T00:00:00Z`) : "—"}
                      </TableCell>
                      <TableCell className="pr-5 text-muted-foreground">{a.antiguedad ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base">Recibos</CardTitle>
              <AvanceRecibos estados={poliza.recibos.map((r) => r.estado)} />
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Recibo</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="pr-5">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poliza.recibos.map((r) => {
                  const estadoR = estadoRecibo[r.estado];
                  return (
                    <TableRow key={r.id} className={cn(r.estado === "CANCELADO" && "text-muted-foreground")}>
                      <TableCell className="pl-5 text-muted-foreground tabular-nums">
                        {r.numero}/{poliza.recibos.length}
                        {r.folio && <p className="font-mono text-[11px]">folio {r.folio}</p>}
                        {r.auto_creado && (
                          <p className="text-[11px] text-sky-600 dark:text-sky-400" title="Lo creó la conciliación; el monto es estimado">
                            auto-creado
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Vencimiento
                          fecha={r.fecha_vencimiento}
                          estado={r.estado}
                          hoy={hoy}
                          diasGracia={poliza.aseguradora.diasGracia}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoneda(Number(r.monto))}
                      </TableCell>
                      <TableCell className="pr-5">
                        <Badge variant="outline" className={estadoR.className}>
                          {estadoR.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <FilePenLine className="size-4 text-primary" /> Endosos · {poliza.endosos.length}
              </CardTitle>
              <CardDescription>Cambios durante la vigencia y su movimiento de prima.</CardDescription>
            </CardHeader>
            {poliza.endosos.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                Sin endosos.{!cancelada && " Regístralos desde «Más → Registrar endoso»."}
              </p>
            ) : (
              <ul className="divide-y">
                {poliza.endosos.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium">
                        {etiquetaEndoso(e.tipo)}
                        {e.numero && <span className="ml-2 font-mono text-xs text-muted-foreground">#{e.numero}</span>}
                      </p>
                      <p className="text-sm whitespace-pre-line text-muted-foreground">{e.descripcion}</p>
                      <p className="text-xs text-muted-foreground">
                        Desde el {formatFecha(e.fecha)}
                        {e.usuarioEmail && ` · ${e.usuarioEmail}`}
                      </p>
                    </div>
                    {e.prima !== null && (
                      <span
                        className={cn(
                          "shrink-0 text-sm font-medium tabular-nums",
                          Number(e.prima) < 0 ? "text-success" : "text-foreground"
                        )}
                        title={Number(e.prima) < 0 ? "Devolución" : "Cobro adicional"}
                      >
                        {Number(e.prima) < 0 ? "−" : "+"}
                        {formatMoneda(Math.abs(Number(e.prima)))}
                      </span>
                    )}
                    <EliminarEndoso endosoId={e.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <HistorialPoliza eventos={historial} limite={LIMITE_HISTORIAL} />
        </div>

        <div className="min-w-0 space-y-6 xl:sticky xl:top-20">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTodo className="size-4 text-primary" /> Tareas
              </CardTitle>
              <CardAction>
                <NuevaTarea
                  hoy={hoy}
                  polizaId={poliza.id}
                  ejecutivos={ejecutivos}
                  usuarioId={user.id}
                  etiqueta="Agregar"
                  variante="ghost"
                  className="h-7"
                />
              </CardAction>
            </CardHeader>
            <ListaTareas tareas={tareas} hoy={hoy} contexto="poliza" vacio="Sin tareas de esta póliza." />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="size-4 text-primary" />
                Documentos
              </CardTitle>
              <CardDescription>Carátula y expediente de respaldo de la póliza.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {TIPOS_ARCHIVO.filter(
                // El formato de negociación solo aplica a GMM Colectivo (o si ya existe).
                (tipo) =>
                  tipo !== "negociacion" ||
                  poliza.ramo === "GMM_COLECTIVO" ||
                  poliza.negociacion_path !== null
              ).map((tipo) => {
                const c = COLUMNAS_ARCHIVO[tipo];
                return (
                  <DocumentoPoliza
                    key={tipo}
                    polizaId={poliza.id}
                    tipo={tipo}
                    archivo={{ nombre: poliza[c.nombre], bytes: poliza[c.bytes], subido: poliza[c.subido] }}
                  />
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <BarraAccionesMovil
        telefono={poliza.cliente.telefono}
        email={poliza.cliente.email}
        mensaje={mensajeCliente}
        asunto={`Su póliza ${poliza.numeroImpreso}`}
        caratulaHref={poliza.caratula_path ? `/polizas/${poliza.id}/archivos/caratula` : null}
      />
    </>
  );
}

function DocumentoPoliza({
  polizaId,
  tipo,
  archivo,
}: {
  polizaId: string;
  tipo: TipoArchivo;
  archivo: { nombre: string | null; bytes: number | null; subido: Date | null };
}) {
  const def = ARCHIVOS[tipo];
  const Icono = def.verEnLinea ? FileText : FileArchive;
  // Enlaces normales (no <Link>): la ruta responde con una redirección a Storage.
  const href = `/polizas/${polizaId}/archivos/${tipo}`;

  return (
    <section className="space-y-3 py-4 first:pt-0 last:pb-0">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icono className="size-4 text-muted-foreground" />
        {def.etiqueta}
      </h3>
      {archivo.nombre ? (
        <>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="truncate text-sm font-medium">{archivo.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(archivo.bytes ?? 0)}
              {archivo.subido && ` · subido el ${formatFecha(archivo.subido)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {def.verEnLinea ? (
              <>
                <Button asChild size="sm">
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> {TEXTO_VER[tipo] ?? "Ver"}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`${href}?descargar=1`} download>
                    <Download /> Descargar {def.extension.toUpperCase()}
                  </a>
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <a href={href} download>
                  <Download /> Descargar {def.extension.toUpperCase()}
                </a>
              </Button>
            )}
          </div>
          <ArchivoUploader polizaId={polizaId} tipo={tipo} reemplazar />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Sin archivo.</p>
          <ArchivoUploader polizaId={polizaId} tipo={tipo} />
        </>
      )}
    </section>
  );
}

const TEXTO_VER: Partial<Record<TipoArchivo, string>> = {
  caratula: "Ver carátula",
  negociacion: "Ver formato",
};

/** Muestra un valor guardado en datos_ramo según el tipo de su campo. */
function formatearValor(campo: CampoDef | undefined, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "number" ? valor : Number(valor);
  switch (campo?.type) {
    case "currency":
      return Number.isFinite(n) ? formatMoneda(n) : String(valor);
    case "percent":
      return `${String(valor)} %`;
    // "number" (año, plazo, asegurados…) se muestra tal cual: sin separador de miles ("2025", no "2,025").
    case "date":
      return typeof valor === "string" ? formatFecha(`${valor}T00:00:00Z`) : String(valor);
    default:
      return String(valor);
  }
}

/** Avance de cobranza: recibos cobrados (pagados o conciliados) de los que se cobran (sin los cancelados). */
function AvanceRecibos({ estados }: { estados: EstadoRecibo[] }) {
  if (estados.length === 0) return null;
  const cancelados = estados.filter((e) => e === "CANCELADO").length;
  const total = estados.length - cancelados;
  const conciliados = estados.filter((e) => e === "CONCILIADO").length;
  const cobrados = estados.filter(esCobrado).length;
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          {cobrados}/{total}
        </span>{" "}
        {cobrados === 1 ? "recibo cobrado" : "recibos cobrados"}
        {cobrados > conciliados && ` · ${cobrados - conciliados} con comisión por aclarar`}
        {cancelados > 0 && ` · ${cancelados} ${cancelados === 1 ? "cancelado" : "cancelados"}`}
      </p>
      <div
        className="flex h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Recibos cobrados"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={cobrados}
      >
        <div className="bg-primary" style={{ width: `${total ? (conciliados / total) * 100 : 0}%` }} />
        <div className="bg-success" style={{ width: `${total ? ((cobrados - conciliados) / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

const humanizar = (clave: string) =>
  clave.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/**
 * Campos específicos del ramo (datos_ramo), con las mismas secciones y etiquetas que el
 * formulario de captura. Lo que no corresponde a un campo actual (p. ej. datos de una
 * versión anterior del formulario) se muestra en "Otros datos" para no ocultarlo.
 */
function DatosRamo({ ramo, datos, sumaIlimitada }: { ramo: string; datos: unknown; sumaIlimitada: boolean }) {
  const valores =
    typeof datos === "object" && datos !== null && !Array.isArray(datos)
      ? (datos as Record<string, unknown>)
      : {};
  const clave = ramoDesdeDb(ramo);
  const secciones = clave ? seccionesPorRamo[clave] : [];
  const conocidos = new Set(secciones.flatMap((s) => s.campos.map((c) => c.name)));
  const campoSuma = sumaIlimitada && clave ? SUMA_ASEGURADA[clave]?.valor : undefined;

  const bloques = [
    ...secciones.map((s) => ({
      titulo: s.titulo,
      filas: s.campos
        // La unidad se muestra junto a su cantidad ("2,000 UMAM"), no en una fila aparte.
        .filter((c) => !(c.name.endsWith("Unidad") && conocidos.has(c.name.replace(/Unidad$/, "Valor"))))
        .map((c) => {
          const unidad = c.name.endsWith("Valor") ? valores[c.name.replace(/Valor$/, "Unidad")] : undefined;
          if (c.name === campoSuma) return { campo: c, label: c.label, valor: TEXTO_SUMA_ILIMITADA };
          const valor =
            unidad !== undefined && valores[c.name] !== undefined && valores[c.name] !== ""
              ? `${formatNumero(Number(valores[c.name]))} ${String(unidad)}`
              : formatearValor(c, valores[c.name]);
          return { campo: c, label: c.label, valor };
        })
        .filter((f) => f.valor),
    })),
    {
      titulo: "Otros datos",
      filas: Object.keys(valores)
        .filter((k) => !conocidos.has(k))
        .map((k) => ({ campo: undefined, label: humanizar(k), valor: formatearValor(undefined, valores[k]) }))
        .filter((f) => f.valor),
    },
  ].filter((b) => b.filas.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos del ramo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {bloques.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos específicos del ramo.</p>
        ) : (
          bloques.map((b) => (
            <section key={b.titulo} className="space-y-3">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {b.titulo}
              </h3>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {b.filas.map((f) => {
                  const largo = f.campo?.type === "textarea";
                  const coberturas =
                    f.campo && CAMPOS_LISTA_COBERTURAS.has(f.campo.name) ? listaDeCoberturas(f.valor) : null;
                  if (coberturas && coberturas.length > 0) {
                    return (
                      <div key={f.label} className="min-w-0 sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="mt-1.5 flex flex-wrap gap-1.5">
                          {coberturas.map((c) => (
                            <span
                              key={c}
                              className="inline-flex items-center rounded-full border border-primary/20 bg-primary/[0.07] px-2.5 py-0.5 text-xs font-medium text-foreground/90"
                            >
                              {c}
                            </span>
                          ))}
                        </dd>
                      </div>
                    );
                  }
                  return (
                    <div key={f.label} className={cn("min-w-0", (largo || f.campo?.wide) && "sm:col-span-2")}>
                      <dt className="text-xs text-muted-foreground">{f.label}</dt>
                      <dd
                        className={cn(
                          "text-sm font-medium",
                          largo
                            ? "mt-1 rounded-lg border bg-background/60 p-3 font-normal whitespace-pre-line"
                            : "truncate"
                        )}
                      >
                        {f.valor}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
