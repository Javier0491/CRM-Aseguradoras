import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarDays, CalendarRange, PieChart } from "lucide-react";

import {
  AseguradoraTag,
  EstadoVigenciaIndicador,
  ramoLabel,
  RamoBadge,
} from "@/components/polizas/poliza-ui";
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
import { DIAS_POR_VENCER_REPORTE, getReportes } from "@/lib/reportes/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Reportes",
};

const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" });

export default async function ReportesPage() {
  const { hoy, mes, anio, distribucion, porVencer, totalPorVencer, primaPorVencer } = await getReportes();
  const fechaHoy = new Date(`${hoy}T00:00:00Z`);
  const totalVigentes = distribucion.reduce((s, d) => s + d.polizas, 0);
  const maxPolizas = Math.max(1, ...distribucion.map((d) => d.polizas));

  const kpis = [
    {
      label: `Prima emitida · ${nombreMes.format(fechaHoy)}`,
      valor: formatMoneda(mes.prima),
      detalle: `${formatNumero(mes.polizas)} ${mes.polizas === 1 ? "póliza" : "pólizas"} iniciadas este mes`,
      icon: CalendarDays,
      clase: "text-primary",
    },
    {
      label: `Prima emitida · ${fechaHoy.getUTCFullYear()}`,
      valor: formatMoneda(anio.prima),
      detalle: `${formatNumero(anio.polizas)} ${anio.polizas === 1 ? "póliza" : "pólizas"} iniciadas en el año`,
      icon: CalendarRange,
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

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Emisión, renovaciones próximas y composición de la cartera al {formatFecha(fechaHoy)}.
        </p>
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
        Prima emitida: prima total de las pólizas cuya vigencia inicia en el periodo.
      </p>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="size-4 text-primary" /> Distribución por ramo
            </CardTitle>
            <CardDescription>{formatNumero(totalVigentes)} pólizas vigentes hoy.</CardDescription>
          </CardHeader>
          <CardContent>
            {distribucion.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No hay pólizas vigentes.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Ramo</th>
                    <th>Pólizas</th>
                    <th>Porcentaje</th>
                    <th>Prima</th>
                  </tr>
                </thead>
                <tbody>
                  {distribucion.map((d) => {
                    const pct = (d.polizas / totalVigentes) * 100;
                    return (
                      <tr key={d.ramo} className="align-middle">
                        <td className="w-32 py-2 pr-3 text-xs whitespace-nowrap text-muted-foreground">
                          {ramoLabel[d.ramo]}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-5 flex-1">
                              <div
                                aria-hidden
                                className="h-full rounded-r bg-primary"
                                style={{ width: `${Math.max(2, (d.polizas / maxPolizas) * 100)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right font-medium tabular-nums">
                              {formatNumero(d.polizas)}
                            </span>
                          </div>
                        </td>
                        <td className="w-14 py-2 text-right text-xs text-muted-foreground tabular-nums">
                          {formatPorcentaje(pct, 0)}
                        </td>
                        <td className="hidden w-32 py-2 text-right text-xs tabular-nums sm:table-cell">
                          {formatMoneda(d.prima)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-warning" /> Próximas a vencer
            </CardTitle>
            <CardDescription>
              Pólizas cuya vigencia termina en los siguientes {DIAS_POR_VENCER_REPORTE} días.
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
      </div>
    </>
  );
}
