import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarCheck,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";

import { PeriodoSelector } from "@/components/dashboard/periodo-selector";
import { ProduccionChart } from "@/components/dashboard/produccion-chart";
import { AseguradoraTag, RamoBadge } from "@/components/polizas/poliza-ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { esAdmin, requireUser } from "@/lib/auth/dal";
import { esPeriodo, PERIODO_PREDETERMINADO } from "@/lib/dashboard/periodos";
import { DIAS_PROXIMOS_VENCIMIENTOS, getDashboard } from "@/lib/dashboard/queries";
import { diasDesdeHoy, formatFecha, formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
};

type MetricCardProps = {
  titulo: string;
  icono: LucideIcon;
  /** Valor ya formateado; null cuando no hay datos para calcularlo. */
  valor: string | null;
  /** Variación porcentual contra el mismo tramo del periodo anterior; null si no aplica. */
  variacion: number | null;
  detalle: string;
};

function MetricCard({ titulo, icono: Icon, valor, variacion, detalle }: MetricCardProps) {
  const positiva = (variacion ?? 0) >= 0;
  const Trend = positiva ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardDescription className="text-xs font-medium tracking-wide uppercase">{titulo}</CardDescription>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-md border bg-background text-primary">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 px-5">
        <p
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            valor === null && "text-muted-foreground"
          )}
        >
          {valor ?? "Sin datos"}
        </p>
        <div className="flex items-center gap-2 text-xs">
          {variacion !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular-nums",
                positiva ? "text-success" : "text-destructive"
              )}
            >
              <Trend className="size-3.5" />
              {positiva ? "+" : ""}
              {formatPorcentaje(variacion)}
            </span>
          )}
          <span className="text-muted-foreground">{detalle}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Vacio({ icono: Icon, titulo, detalle }: { icono: LucideIcon; titulo: string; detalle: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <p className="text-sm font-medium">{titulo}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const { periodo: periodoParam } = await searchParams;
  const periodo = esPeriodo(periodoParam) ? periodoParam : PERIODO_PREDETERMINADO;
  // "…que inician vigencia este mes / en el último trimestre / en el año actual"
  const enPeriodo = { mes: "este mes", trimestre: "en el último trimestre", anio: "en el año actual" }[periodo];

  // Las comisiones son información confidencial: solo las ve el rol ADMIN.
  const verComisiones = esAdmin(await requireUser());
  const { rango, hoy, totalPolizas, metricas, produccion, recibos, vencimientos } = await getDashboard(periodo, {
    incluirComisiones: verComisiones,
  });
  const contraAnterior = "vs. periodo anterior";
  const { renovacion } = metricas;

  const { comisiones } = metricas;
  const tarjetas: (MetricCardProps | null)[] = [
    {
      titulo: "Primas Emitidas",
      icono: Landmark,
      valor: formatMoneda(metricas.primas.valor),
      variacion: metricas.primas.variacion,
      detalle: metricas.primas.variacion !== null ? contraAnterior : `pólizas que inician vigencia ${enPeriodo}`,
    },
    comisiones && {
      titulo: "Comisiones Pendientes",
      icono: HandCoins,
      valor: formatMoneda(comisiones.valor),
      variacion: null,
      detalle:
        comisiones.recibos === 0
          ? `sin recibos pendientes ${enPeriodo}`
          : `${formatNumero(comisiones.recibos)} ${comisiones.recibos === 1 ? "recibo pendiente" : "recibos pendientes"}` +
            (comisiones.sinPorcentaje > 0 ? ` · ${comisiones.sinPorcentaje} sin matriz` : ""),
    },
    {
      titulo: "Pólizas Activas",
      icono: FileText,
      valor: formatNumero(metricas.activas.valor),
      variacion: metricas.activas.variacion,
      detalle: metricas.activas.variacion !== null ? contraAnterior : "con vigencia en el periodo",
    },
    {
      titulo: "Tasa de Renovación",
      icono: RefreshCcw,
      valor: renovacion.tasa === null ? null : formatPorcentaje(renovacion.tasa),
      variacion: null,
      detalle:
        renovacion.tasa === null
          ? "Sin vencimientos en el periodo"
          : `${renovacion.renovadas} de ${renovacion.vencidas} ${renovacion.vencidas === 1 ? "vencida" : "vencidas"}`,
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Resumen Directivo</h1>
          <p className="text-sm text-muted-foreground">
            {formatFecha(rango.desde)} – {formatFecha(rango.hasta)} · cartera, producción y cobranza.
          </p>
        </div>
        <PeriodoSelector periodo={periodo} />
      </div>

      <section
        aria-label="Métricas principales"
        className={cn("grid gap-4 sm:grid-cols-2", comisiones ? "xl:grid-cols-4" : "xl:grid-cols-3")}
      >
        {tarjetas.map((t) => t && <MetricCard key={t.titulo} {...t} />)}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Producción por Aseguradora</CardTitle>
              <CardDescription>Prima emitida de las pólizas que inician vigencia {enPeriodo}.</CardDescription>
            </CardHeader>
            <CardContent>
              {produccion.length === 0 ? (
                <Vacio
                  icono={BarChart3}
                  titulo="Sin producción en el periodo"
                  detalle={
                    totalPolizas === 0
                      ? "Aún no hay pólizas registradas. Captura la primera desde Captura Inteligente."
                      : "Ninguna póliza inicia vigencia en este periodo; prueba con un rango más amplio."
                  }
                />
              ) : (
                <ProduccionChart datos={produccion} />
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base">Últimos Recibos Conciliados</CardTitle>
              <CardDescription>Recibos conciliados en el periodo contra estados de cuenta.</CardDescription>
              {verComisiones && (
                <CardAction>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/conciliacion">Ver conciliación</Link>
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            {recibos.length === 0 ? (
              <Vacio
                icono={ReceiptText}
                titulo="No hay recibos conciliados recientemente"
                detalle="Cuando se concilien pagos contra los estados de cuenta de las aseguradoras aparecerán aquí."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Póliza</TableHead>
                    <TableHead>Recibo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aseguradora</TableHead>
                    <TableHead>Ramo</TableHead>
                    <TableHead>Conciliado</TableHead>
                    <TableHead className={cn("text-right", !verComisiones && "pr-5")}>Monto</TableHead>
                    {verComisiones && <TableHead className="pr-5 text-right">Comisión</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recibos.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5 font-mono text-xs">
                        <Link href={`/polizas/${r.poliza.id}`} className="hover:text-primary hover:underline">
                          {r.poliza.numeroImpreso}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {r.numero}/{r.poliza._count.recibos}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium">{r.poliza.cliente.nombre}</TableCell>
                      <TableCell>
                        <AseguradoraTag nombre={r.poliza.aseguradora.nombre} color={r.poliza.aseguradora.color_hex} />
                      </TableCell>
                      <TableCell>
                        <RamoBadge ramo={r.poliza.ramo} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.conciliado_at ? formatFecha(r.conciliado_at) : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", !verComisiones && "pr-5")}>
                        {formatMoneda(Number(r.monto))}
                      </TableCell>
                      {verComisiones && (
                        <TableCell className="pr-5 text-right font-medium text-primary tabular-nums">
                          {r.comision_pagada !== null ? formatMoneda(Number(r.comision_pagada)) : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        <Card className="gap-0 py-0 xl:sticky xl:top-20">
          <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="size-4 text-warning" />
              Próximos Vencimientos
            </CardTitle>
            <CardDescription>Pólizas que vencen en los próximos {DIAS_PROXIMOS_VENCIMIENTOS} días.</CardDescription>
          </CardHeader>
          {vencimientos.length === 0 ? (
            <Vacio
              icono={CalendarCheck}
              titulo="Sin vencimientos próximos"
              detalle={`Ninguna póliza vence en los próximos ${DIAS_PROXIMOS_VENCIMIENTOS} días.`}
            />
          ) : (
            <ul className="divide-y">
              {vencimientos.map((p) => {
                const dias = diasDesdeHoy(p.vigencia_fin, hoy);
                return (
                  <li key={p.id}>
                    <Link
                      href={`/polizas/${p.id}`}
                      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium">{p.cliente.nombre}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <RamoBadge ramo={p.ramo} />
                          <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs tabular-nums">{formatFecha(p.vigencia_fin)}</p>
                        <p className={cn("text-[11px] font-medium", dias <= 7 ? "text-destructive" : "text-warning")}>
                          {dias === 0 ? "Vence hoy" : `En ${dias} d`}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
