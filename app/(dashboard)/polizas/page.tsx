import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FilePlus2, FileText, Paperclip, PhoneOff, Receipt, SearchX, Wallet } from "lucide-react";

import { FiltrosPolizas } from "@/components/polizas/filtros-polizas";
import {
  AseguradoraTag,
  AseguradosResumen,
  EstadoVigenciaIndicador,
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
import { formatFecha, formatMoneda, formatNumero, hoyISO } from "@/lib/format";
import type { Ramo } from "@/lib/generated/prisma/client";
import {
  DIAS_POR_VENCER,
  getPolizasListado,
  getRecibosListado,
  LIMITE_LISTADO,
} from "@/lib/polizas/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pólizas",
};

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

const esRamo = (v: unknown): v is Ramo => typeof v === "string" && v in ramoLabel;
const opcionesRamo = (Object.keys(ramoLabel) as Ramo[]).map((r) => ({ value: r, label: ramoLabel[r] }));

export default async function PolizasPage({ searchParams }: PageProps<"/polizas">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const ramo = esRamo(params.ramo) ? params.ramo : undefined;
  const soloFaltaContacto = params.contacto === "falta";
  const filtrando = q.trim() !== "" || ramo !== undefined || soloFaltaContacto;

  const [
    { polizas, total: totalPolizas, totalGeneral, porVencer, faltaContacto },
    { recibos, total: totalRecibos, pendientes },
  ] = await Promise.all([
    getPolizasListado({ q, ramo, faltaContacto: soloFaltaContacto }),
    getRecibosListado(),
  ]);
  const hoy = hoyISO();

  // El aviso alterna el filtro "Falta contacto" conservando la búsqueda y el ramo.
  const paramsContacto = new URLSearchParams();
  if (q.trim()) paramsContacto.set("q", q.trim());
  if (ramo) paramsContacto.set("ramo", ramo);
  if (!soloFaltaContacto) paramsContacto.set("contacto", "falta");
  const hrefContacto = paramsContacto.size ? `/polizas?${paramsContacto}` : "/polizas";

  const resumen = [
    { label: "Pólizas registradas", valor: formatNumero(totalGeneral), icon: FileText, clase: "text-primary" },
    {
      label: `Por vencer · ${DIAS_POR_VENCER} días`,
      valor: formatNumero(porVencer),
      icon: CalendarClock,
      clase: porVencer > 0 ? "text-warning" : "text-primary",
    },
    { label: "Recibos pendientes", valor: formatNumero(pendientes.cantidad), icon: Receipt, clase: "text-primary" },
    { label: "Monto por cobrar", valor: formatMoneda(pendientes.monto), icon: Wallet, clase: "text-primary" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pólizas y Recibos</h1>
          <p className="text-sm text-muted-foreground">
            Cartera registrada y calendario de cobranza.
          </p>
        </div>
        <Button asChild>
          <Link href="/captura">
            <FilePlus2 /> Nueva póliza
          </Link>
        </Button>
      </div>

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumen.map((r) => (
          <Card key={r.label} className="flex-row items-center gap-4 px-5 py-4">
            <div className={cn("flex size-9 items-center justify-center rounded-md border bg-background", r.clase)}>
              <r.icon className="size-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{r.valor}</p>
              <p className="text-xs text-muted-foreground">{r.label}</p>
            </div>
          </Card>
        ))}
      </section>

      {totalGeneral === 0 ? (
        <SinDatos />
      ) : (
        <Tabs defaultValue="polizas" className="gap-4">
          <TabsList>
            <TabsTrigger value="polizas">
              Pólizas · {formatNumero(filtrando ? totalPolizas : totalGeneral)}
            </TabsTrigger>
            <TabsTrigger value="recibos">Recibos · {formatNumero(totalRecibos)}</TabsTrigger>
          </TabsList>

          <TabsContent value="polizas" className="space-y-4">
            {(faltaContacto > 0 || soloFaltaContacto) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning/20 text-warning">
                  <PhoneOff className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
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
            />
            <Card className="gap-0 py-0">
              {polizas.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
                  <SearchX className="size-7 text-muted-foreground" />
                  <p className="font-medium">Ninguna póliza coincide con los filtros</p>
                  <p className="text-sm text-muted-foreground">
                    Prueba con otro número, nombre o RFC, o cambia el ramo o el filtro de contacto.
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
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Prima total</TableHead>
                      <TableHead className="pr-5 text-right">Recibos pagados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {polizas.map((p) => {
                      const cobrados = p.recibos.filter((r) => r.estado !== "PENDIENTE").length;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="pl-5">
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
                          <TableCell className="max-w-[220px]">
                            <p className="truncate font-medium">{p.cliente.nombre}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{p.cliente.rfc}</p>
                            <FaltaContacto telefono={p.cliente.telefono} email={p.cliente.email} />
                          </TableCell>
                          <TableCell>
                            <RamoBadge ramo={p.ramo} />
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <AseguradosResumen
                              ramo={p.ramo}
                              contratante={p.cliente.nombre}
                              titular={p.asegurados[0]?.nombre ?? null}
                              total={p._count.asegurados}
                            />
                          </TableCell>
                          <TableCell>
                            <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                          </TableCell>
                          <TableCell>
                            <EstadoVigenciaIndicador fin={p.vigencia_fin} hoy={hoy} diasAviso={DIAS_POR_VENCER} />
                            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                              {formatFecha(p.vigencia_inicio)} – {formatFecha(p.vigencia_fin)}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="font-medium tabular-nums">{formatMoneda(Number(p.prima_total))}</p>
                            <p className="text-[11px] text-muted-foreground">{formaPagoLabel[p.forma_pago]}</p>
                          </TableCell>
                          <TableCell className="pr-5 text-right tabular-nums">
                            {cobrados}/{p.recibos.length}
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

          <TabsContent value="recibos">
            <Card className="gap-0 py-0">
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
                        <TableCell className="pl-5 font-mono text-xs">
                          <Link href={`/polizas/${r.poliza.id}`} className="hover:text-primary hover:underline">
                            {r.poliza.numeroImpreso}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {r.numero}/{r.poliza._count.recibos}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate font-medium">
                          {r.poliza.cliente.nombre}
                        </TableCell>
                        <TableCell>
                          <AseguradoraTag
                            nombre={r.poliza.aseguradora.nombre}
                            color={r.poliza.aseguradora.color_hex}
                          />
                        </TableCell>
                        <TableCell>
                          <Vencimiento fecha={r.fecha_vencimiento} estado={r.estado} hoy={hoy} />
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
              <NotaLimite mostrados={recibos.length} total={totalRecibos} />
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
