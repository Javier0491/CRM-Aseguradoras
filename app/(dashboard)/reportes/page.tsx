import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, CalendarClock, Download, FileText, Landmark, PieChart, type LucideIcon } from "lucide-react";

import { PeriodoSelector } from "@/components/dashboard/periodo-selector";
import {
  AseguradoraTag,
  EstadoVigenciaIndicador,
  ramoLabel,
  RamoBadge,
} from "@/components/polizas/poliza-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatFecha, formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
import {
  esPeriodoReporte,
  PERIODO_REPORTE_PREDETERMINADO,
  PERIODOS_REPORTE,
  type PeriodoReporte,
} from "@/lib/reportes/periodos";
import { DIAS_POR_VENCER_REPORTE, getReportes } from "@/lib/reportes/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Reportes",
};

const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" });

const polizasTexto = (n: number) => `${formatNumero(n)} ${n === 1 ? "póliza" : "pólizas"}`;

type Segmento = { clave: string; etiqueta: ReactNode; polizas: number; prima: number };

/** Barras horizontales con la participación de cada segmento en la prima emitida del periodo. */
function DistribucionCard({
  titulo,
  icono: Icono,
  descripcion,
  columna,
  segmentos,
}: {
  titulo: string;
  icono: LucideIcon;
  descripcion: string;
  columna: string;
  segmentos: Segmento[];
}) {
  const primaTotal = segmentos.reduce((s, d) => s + d.prima, 0);
  const maxPrima = Math.max(1, ...segmentos.map((d) => d.prima));

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icono className="size-4 text-primary" /> {titulo}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        {segmentos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay pólizas emitidas en el periodo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>{columna}</th>
                <th>Prima</th>
                <th>Porcentaje de la prima</th>
                <th>Pólizas</th>
              </tr>
            </thead>
            <tbody>
              {segmentos.map((d) => {
                const pct = primaTotal > 0 ? (d.prima / primaTotal) * 100 : 0;
                return (
                  <tr key={d.clave} className="align-middle">
                    <td className="w-32 max-w-32 truncate py-2 pr-3 text-xs whitespace-nowrap text-muted-foreground">
                      {d.etiqueta}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-5 flex-1">
                          <div
                            aria-hidden
                            className="h-full rounded-r bg-primary"
                            style={{ width: `${Math.max(2, (d.prima / maxPrima) * 100)}%` }}
                          />
                        </div>
                        <span className="w-28 text-right text-xs font-medium tabular-nums">
                          {formatMoneda(d.prima)}
                        </span>
                      </div>
                    </td>
                    <td className="w-14 py-2 text-right text-xs text-muted-foreground tabular-nums">
                      {formatPorcentaje(pct, 0)}
                    </td>
                    <td className="hidden w-24 py-2 text-right text-xs text-muted-foreground tabular-nums sm:table-cell">
                      {polizasTexto(d.polizas)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default async function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  const { periodo: periodoParam } = await searchParams;
  const periodo: PeriodoReporte = esPeriodoReporte(periodoParam) ? periodoParam : PERIODO_REPORTE_PREDETERMINADO;

  const {
    hoy,
    rango,
    emision,
    distribucion,
    distribucionAseguradora,
    porVencer,
    totalPorVencer,
    primaPorVencer,
  } = await getReportes(periodo);
  const fechaHoy = new Date(`${hoy}T00:00:00Z`);
  const nombrePeriodo = {
    mes: nombreMes.format(fechaHoy),
    anio: String(fechaHoy.getUTCFullYear()),
    historico: "histórico",
  }[periodo];
  const enPeriodo = { mes: "este mes", anio: "en el año", historico: "desde el inicio" }[periodo];
  const exportarHref =
    periodo === PERIODO_REPORTE_PREDETERMINADO ? "/reportes/exportar" : `/reportes/exportar?periodo=${periodo}`;

  const kpis = [
    {
      label: `Prima emitida · ${nombrePeriodo}`,
      valor: formatMoneda(emision.prima),
      detalle: `${polizasTexto(emision.polizas)} ${emision.polizas === 1 ? "iniciada" : "iniciadas"} ${enPeriodo}`,
      icon: Landmark,
      clase: "text-primary",
    },
    {
      label: `Prima promedio · ${nombrePeriodo}`,
      valor: emision.polizas > 0 ? formatMoneda(emision.prima / emision.polizas) : "—",
      detalle: `por póliza iniciada ${enPeriodo}`,
      icon: FileText,
      clase: "text-primary",
    },
    {
      label: `Por vencer · ${DIAS_POR_VENCER_REPORTE} días`,
      valor: formatNumero(totalPorVencer),
      detalle: `Prima a renovar: ${formatMoneda(primaPorVencer)}`,
      icon: CalendarClock,
      clase: totalPorVencer > 0 ? "text-warning" : "text-primary",
    },
  ];

  const resumenEmision = `${polizasTexto(emision.polizas)} · ${formatMoneda(emision.prima)} de prima emitida.`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            {rango ? `${formatFecha(rango.desde)} – ${formatFecha(rango.hasta)}` : "Sin pólizas emitidas"} · emisión,
            renovaciones próximas y composición de la cartera.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodoSelector
            periodo={periodo}
            opciones={PERIODOS_REPORTE}
            predeterminado={PERIODO_REPORTE_PREDETERMINADO}
            etiqueta="Periodo del reporte"
          />
          <Button asChild variant="outline" size="sm" className="h-9 text-muted-foreground">
            <a href={exportarHref} download>
              <Download /> Exportar
            </a>
          </Button>
        </div>
      </div>

      <section aria-label="Indicadores" className="grid gap-4 md:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-2 px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <k.icon className={cn("size-4", k.clase)} />
              <span className="first-letter:uppercase">{k.label}</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{k.valor}</p>
            <p className="text-xs text-muted-foreground">{k.detalle}</p>
          </Card>
        ))}
      </section>
      <p className="-mt-3 text-[11px] text-muted-foreground">
        Prima emitida: prima total de las pólizas cuya vigencia inicia en el periodo. El CSV exportado contiene esas
        mismas pólizas.
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <DistribucionCard
          titulo="Distribución por ramo"
          icono={PieChart}
          descripcion={resumenEmision}
          columna="Ramo"
          segmentos={distribucion.map((d) => ({ clave: d.ramo, etiqueta: ramoLabel[d.ramo], ...d }))}
        />
        <DistribucionCard
          titulo="Distribución por aseguradora"
          icono={Building2}
          descripcion={resumenEmision}
          columna="Aseguradora"
          segmentos={distribucionAseguradora.map((d) => ({
            clave: d.id,
            etiqueta: <AseguradoraTag nombre={d.nombre} color={d.color} />,
            polizas: d.polizas,
            prima: d.prima,
          }))}
        />
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-warning" /> Próximas a vencer
          </CardTitle>
          <CardDescription>
            Pólizas cuya vigencia termina en los siguientes {DIAS_POR_VENCER_REPORTE} días (no depende del periodo).
          </CardDescription>
        </CardHeader>
        {porVencer.length === 0 ? (
          <p className="px-6 pb-8 text-center text-sm text-muted-foreground">
            Ninguna póliza vence en los próximos {DIAS_POR_VENCER_REPORTE} días.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Póliza</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aseguradora</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="pr-6 text-right">Prima</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porVencer.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-6">
                    <Link
                      href={`/polizas/${p.id}`}
                      className="font-mono text-xs hover:text-primary hover:underline"
                    >
                      {p.numeroImpreso}
                    </Link>
                    <div className="mt-1">
                      <RamoBadge ramo={p.ramo} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="truncate font-medium">{p.cliente.nombre}</p>
                    {p.cliente.telefono && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">{p.cliente.telefono}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                  </TableCell>
                  <TableCell>
                    <EstadoVigenciaIndicador fin={p.vigencia_fin} hoy={hoy} diasAviso={DIAS_POR_VENCER_REPORTE} />
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {formatFecha(p.vigencia_fin)}
                    </p>
                  </TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums">
                    {formatMoneda(p.prima_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {totalPorVencer > porVencer.length && (
          <p className="border-t px-6 py-3 text-xs text-muted-foreground">
            Mostrando {formatNumero(porVencer.length)} de {formatNumero(totalPorVencer)} pólizas.
          </p>
        )}
      </Card>
    </>
  );
}
