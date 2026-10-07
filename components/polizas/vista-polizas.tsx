import Link from "next/link";
import { Ban, CalendarClock, Download, FilePlus2, FileText, Paperclip, PhoneOff, Receipt, SearchX, Wallet } from "lucide-react";

import { PolizasConciliadas, PolizasSinConciliar } from "@/components/polizas/conciliacion-polizas";
import { ValorAjustado } from "@/components/dashboard/valor-ajustado";
import { FiltrosPolizas } from "@/components/polizas/filtros-polizas";
import {
  AseguradoraTag,
  AseguradosResumen,
  EstadoVigenciaIndicador,
  esCobrado,
  estadoRecibo,
  FaltaContacto,
  formaPagoLabel,
  ramoLabel,
  RamoBadge,
  Vencimiento,
} from "@/components/polizas/poliza-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFecha, formatMoneda, formatNumero } from "@/lib/format";
import type { Ramo } from "@/lib/generated/prisma/client";
import type { EstadoConciliacion } from "@/lib/polizas/conciliacion";
import {
  DIAS_POR_VENCER,
  FILTROS_RECIBOS,
  LIMITE_LISTADO,
  type FiltroRecibos,
  type getPolizasListado,
  type getRecibosListado,
} from "@/lib/polizas/queries";
import type { OpcionEjecutivo } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

function SinDatos() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <FileText className="size-8 text-primary" />
        <p className="font-medium">Aún no hay pólizas registradas</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Captura la primera desde el módulo de Captura Inteligente; sus recibos se generan
          automáticamente.
        </p>
        <Button asChild>
          <Link href="/captura">
            <FilePlus2 /> Capturar póliza
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function NotaLimite({ mostrados, total }: { mostrados: number; total: number }) {
  if (total <= mostrados) return null;
  return (
    <p className="border-t px-5 py-3 text-xs text-muted-foreground">
      Mostrando {formatNumero(mostrados)} de {formatNumero(total)} registros (límite {LIMITE_LISTADO}).
    </p>
  );
}

export const esRamo = (v: unknown): v is Ramo => typeof v === "string" && v in ramoLabel;
const opcionesRamo = (Object.keys(ramoLabel) as Ramo[]).map((r) => ({ value: r, label: ramoLabel[r] }));
const PESTANAS = ["polizas", "recibos", "conciliadas", "sin-conciliar"] as const;
export type PestanaPolizas = (typeof PESTANAS)[number];
export const esPestana = (v: unknown): v is PestanaPolizas =>
  typeof v === "string" && (PESTANAS as readonly string[]).includes(v);

export type DatosPolizas = {
  listado: Awaited<ReturnType<typeof getPolizasListado>>;
  listadoRecibos: Awaited<ReturnType<typeof getRecibosListado>>;
  conciliacion: EstadoConciliacion;
  /** Para filtrar por ejecutivo; no viene para quien solo ve su cartera. */
  ejecutivos?: OpcionEjecutivo[];
  filtros: {
    q: string;
    ramo?: Ramo;
    soloFaltaContacto: boolean;
    ejecutivo: string;
    estatus: "" | "vigor" | "canceladas";
    filtroRecibos: FiltroRecibos;
    pestana: PestanaPolizas;
  };
  usuario: { id: string; soloSuCartera: boolean; verComisiones: boolean };
  hoy: string;
};

/** Pólizas y recibos: resumen, filtros y listados. La página carga los datos. */
export function VistaPolizas({ listado, listadoRecibos, conciliacion, ejecutivos, filtros, usuario, hoy }: DatosPolizas) {
  const { polizas, total: totalPolizas, totalGeneral, porVencer, faltaContacto, canceladas } = listado;
  const { recibos, total: totalRecibos, pendientes } = listadoRecibos;
  const { q, ramo, soloFaltaContacto, ejecutivo, estatus, filtroRecibos, pestana } = filtros;
  const filtrando = q.trim() !== "" || ramo !== undefined || soloFaltaContacto || ejecutivo !== "" || estatus !== "";
  const verEjecutivo = !usuario.soloSuCartera;

  // Filtros actuales del listado, para el aviso de contacto y el reporte.
  const filtrosUrl = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (ramo) p.set("ramo", ramo);
    if (ejecutivo) p.set("ejecutivo", ejecutivo);
    if (estatus) p.set("estatus", estatus);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return p;
  };
  // El aviso alterna el filtro "Falta contacto" conservando los demás.
  const paramsContacto = filtrosUrl({ contacto: soloFaltaContacto ? undefined : "falta" });
  const hrefContacto = paramsContacto.size ? `/polizas?${paramsContacto}` : "/polizas";
  // El reporte exporta la cartera con los filtros activos.
  const paramsReporte = filtrosUrl({ contacto: soloFaltaContacto ? "falta" : undefined });
  const hrefReporte = paramsReporte.size ? `/polizas/reporte-cartera?${paramsReporte}` : "/polizas/reporte-cartera";

  const resumen = [
    { label: "Pólizas registradas", valor: formatNumero(totalGeneral), icon: FileText, clase: "text-primary" },
    {
      label: `Por vencer · ${DIAS_POR_VENCER} días`,
      valor: formatNumero(porVencer),
      icon: CalendarClock,
      clase: porVencer > 0 ? "text-warning" : "text-primary",
      href: "/renovaciones",
    },
    {
      label: "Recibos pendientes",
      valor: formatNumero(pendientes.cantidad),
      icon: Receipt,
      clase: "text-primary",
      href: "/polizas?tab=recibos&recibos=pendientes",
    },
    { label: "Monto por cobrar", valor: formatMoneda(pendientes.monto), icon: Wallet, clase: "text-primary" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pólizas y Recibos</h1>
          <p className="text-sm text-muted-foreground">
            {usuario.soloSuCartera ? "Tu cartera de pólizas y su calendario de cobranza." : "Cartera registrada y calendario de cobranza."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {totalGeneral > 0 && (
            <Button asChild variant="outline">
              {/* Enlace normal: la ruta responde con el archivo. */}
              <a href={hrefReporte} download title={filtrando ? "Exporta solo las pólizas que coinciden con los filtros" : undefined}>
                <Download /> Exportar reporte
              </a>
            </Button>
          )}
          <Button asChild>
            <Link href="/captura">
              <FilePlus2 /> Nueva póliza
            </Link>
          </Button>
        </div>
      </div>

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumen.map((r) => {
          const contenido = (
            <Card
              className={cn(
                "@container h-full flex-row items-center gap-4 px-5 py-4",
                r.href && "transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
              )}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border bg-background",
                  // Con un monto largo en una tarjeta angosta, el ícono cede su lugar.
                  r.valor.length > 12 && "@max-[15rem]:hidden",
                  r.clase
                )}
              >
                <r.icon className="size-4" />
              </div>
              <div className="@container min-w-0 flex-1">
                <ValorAjustado valor={r.valor} />
                <p className="text-xs text-muted-foreground">{r.label}</p>
              </div>
            </Card>
          );
          return r.href ? (
            <Link key={r.label} href={r.href} className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {contenido}
            </Link>
          ) : (
            <div key={r.label}>{contenido}</div>
          );
        })}
      </section>

      {totalGeneral === 0 ? (
        <SinDatos />
      ) : (
        <Tabs defaultValue={pestana} className="gap-4">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="polizas">
              Pólizas · {formatNumero(filtrando ? totalPolizas : totalGeneral)}
            </TabsTrigger>
            <TabsTrigger value="recibos">Recibos · {formatNumero(totalRecibos)}</TabsTrigger>
            <TabsTrigger value="conciliadas">
              Conciliadas · {formatNumero(conciliacion.conciliadas.length)}
            </TabsTrigger>
            <TabsTrigger value="sin-conciliar">
              Sin conciliar · {formatNumero(conciliacion.sinConciliar.length)}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="polizas" className="space-y-4">
            {(faltaContacto > 0 || soloFaltaContacto) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning/20 text-warning">
                  <PhoneOff className="size-4" />
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-semibold text-warning">
                    {faltaContacto === 0
                      ? "Todas las pólizas tienen contacto completo"
                      : `Falta contacto en ${formatNumero(faltaContacto)} ${faltaContacto === 1 ? "póliza" : "pólizas"}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {soloFaltaContacto
                      ? "Mostrando solo pólizas cuyo cliente no tiene teléfono o correo. Complétalos desde Editar."
                      : "Se capturaron sin teléfono o correo del cliente; complétalos para poder avisarle de sus recibos."}
                  </p>
                </div>
                <Button asChild size="sm" variant={soloFaltaContacto ? "outline" : "default"}>
                  <Link href={hrefContacto} scroll={false}>
                    {soloFaltaContacto ? "Ver todas" : "Ver pólizas"}
                  </Link>
                </Button>
              </div>
            )}
            <FiltrosPolizas
              q={q}
              ramo={ramo ?? ""}
              ramos={opcionesRamo}
              faltaContacto={soloFaltaContacto}
              ejecutivo={ejecutivo}
              ejecutivos={ejecutivos}
              usuarioId={usuario.id}
              estatus={estatus}
            />
            {canceladas > 0 && estatus === "" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Ban className="size-3.5" /> {formatNumero(canceladas)}{" "}
                {canceladas === 1 ? "póliza cancelada aparece" : "pólizas canceladas aparecen"} en el listado; filtra por
                estatus para ocultarlas.
              </p>
            )}
            <Card className="gap-0 py-0">
              {polizas.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
                  <SearchX className="size-7 text-muted-foreground" />
                  <p className="font-medium">Ninguna póliza coincide con los filtros</p>
                  <p className="text-sm text-muted-foreground">
                    Prueba con otro número, nombre o RFC, o cambia el ramo, el ejecutivo o el estatus.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Póliza</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Ramo</TableHead>
                      <TableHead>Asegurados</TableHead>
                      <TableHead>Aseguradora</TableHead>
                      {verEjecutivo && <TableHead>Ejecutivo</TableHead>}
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Prima total</TableHead>
                      <TableHead className="pr-5 text-right whitespace-normal">Recibos pagados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {polizas.map((p) => {
                      const cobrados = p.recibos.filter((r) => esCobrado(r.estado)).length;
                      const cobrables = p.recibos.filter((r) => r.estado !== "CANCELADO").length;
                      return (
                        <TableRow key={p.id} className={cn(p.canceladaAt && "text-muted-foreground")}>
                          <TableCell className="max-w-52 min-w-36 pl-5 whitespace-normal wrap-anywhere">
                            <Link
                              href={`/polizas/${p.id}`}
                              className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary hover:underline"
                            >
                              {p.numeroImpreso}
                              {(p.caratula_path || p.negociacion_path) && (
                                <FileText className="size-3 text-primary" aria-label="Con documentos PDF" />
                              )}
                              {p.expediente_path && (
                                <Paperclip className="size-3 text-primary" aria-label="Con expediente ZIP" />
                              )}
                            </Link>
                            {p.polizaVigor && (
                              <p className="font-mono text-[11px] text-muted-foreground">
                                vigor: {p.polizaVigor}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="max-w-56">
                            <p className="truncate font-medium" title={p.cliente.nombre}>
                              {p.cliente.nombre}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">{p.cliente.rfc}</p>
                            <FaltaContacto telefono={p.cliente.telefono} email={p.cliente.email} />
                          </TableCell>
                          <TableCell>
                            <RamoBadge ramo={p.ramo} />
                          </TableCell>
                          <TableCell className="max-w-50">
                            <AseguradosResumen
                              ramo={p.ramo}
                              contratante={p.cliente.nombre}
                              titular={p.asegurados[0]?.nombre ?? null}
                              total={p._count.asegurados}
                            />
                          </TableCell>
                          <TableCell className="max-w-52">
                            <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                          </TableCell>
                          {verEjecutivo && (
                            <TableCell className="max-w-40 truncate text-sm" title={p.ejecutivo?.nombre}>
                              {p.ejecutivo?.nombre ?? <span className="text-xs text-muted-foreground">Sin asignar</span>}
                            </TableCell>
                          )}
                          <TableCell>
                            <EstadoVigenciaIndicador
                              fin={p.vigencia_fin}
                              hoy={hoy}
                              diasAviso={DIAS_POR_VENCER}
                              cancelada={p.canceladaAt}
                            />
                            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                              {formatFecha(p.vigencia_inicio)} – {formatFecha(p.vigencia_fin)}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="font-medium tabular-nums">{formatMoneda(Number(p.prima_total))}</p>
                            <p className="text-[11px] text-muted-foreground">{formaPagoLabel[p.forma_pago]}</p>
                          </TableCell>
                          <TableCell className="pr-5 text-right tabular-nums">
                            {cobrados}/{cobrables}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <NotaLimite mostrados={polizas.length} total={totalPolizas} />
            </Card>
          </TabsContent>

          <TabsContent value="conciliadas">
            <PolizasConciliadas polizas={conciliacion.conciliadas} limite={LIMITE_LISTADO} />
          </TabsContent>

          <TabsContent value="sin-conciliar">
            <PolizasSinConciliar
              polizas={conciliacion.sinConciliar}
              noEncontradas={conciliacion.noEncontradas}
              verComisiones={usuario.verComisiones}
              limite={LIMITE_LISTADO}
            />
          </TabsContent>

          <TabsContent value="recibos" className="space-y-4">
            <nav aria-label="Filtrar recibos" className="flex flex-wrap gap-2">
              {FILTROS_RECIBOS.map((f) => (
                <Button
                  key={f.value}
                  asChild
                  size="sm"
                  variant={filtroRecibos === f.value ? "default" : "outline"}
                  className="h-8"
                >
                  <Link
                    href={f.value === "todos" ? "/polizas?tab=recibos" : `/polizas?tab=recibos&recibos=${f.value}`}
                    scroll={false}
                    aria-current={filtroRecibos === f.value ? "page" : undefined}
                  >
                    {f.label}
                  </Link>
                </Button>
              ))}
            </nav>
            <Card className="gap-0 py-0">
              {recibos.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {filtroRecibos === "todos" ? "No hay recibos registrados." : "Ningún recibo coincide con el filtro."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Póliza</TableHead>
                      <TableHead>Recibo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Aseguradora</TableHead>
                      <TableHead>Vencimiento</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="pr-5">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recibos.map((r) => {
                      const estado = estadoRecibo[r.estado];
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="max-w-52 min-w-36 pl-5 font-mono text-xs whitespace-normal wrap-anywhere">
                            <Link href={`/polizas/${r.poliza.id}`} className="hover:text-primary hover:underline">
                              {r.poliza.numeroImpreso}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {r.numero}/{r.poliza._count.recibos}
                          </TableCell>
                          <TableCell className="max-w-60 truncate font-medium" title={r.poliza.cliente.nombre}>
                            {r.poliza.cliente.nombre}
                          </TableCell>
                          <TableCell className="max-w-52">
                            <AseguradoraTag
                              nombre={r.poliza.aseguradora.nombre}
                              color={r.poliza.aseguradora.color_hex}
                            />
                          </TableCell>
                          <TableCell className="min-w-36 whitespace-normal">
                            <Vencimiento
                              fecha={r.fecha_vencimiento}
                              estado={r.estado}
                              hoy={hoy}
                              diasGracia={r.poliza.aseguradora.diasGracia}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatMoneda(Number(r.monto))}
                          </TableCell>
                          <TableCell className="pr-5">
                            <Badge variant="outline" className={cn(estado.className)}>
                              {estado.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <NotaLimite mostrados={recibos.length} total={totalRecibos} />
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
