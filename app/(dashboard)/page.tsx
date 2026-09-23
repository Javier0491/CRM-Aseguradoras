import type { Metadata } from "next";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileText,
  HandCoins,
  Landmark,
  RefreshCcw,
  type LucideIcon,
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatFecha,
  formatMoneda,
  formatNumero,
  formatPorcentaje,
} from "@/lib/format";
import {
  metricas,
  recibosConciliados,
  type EstatusConciliacion,
  type Metrica,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
};

const iconosMetrica: Record<string, LucideIcon> = {
  primas: Landmark,
  comisiones: HandCoins,
  polizas: FileText,
  renovacion: RefreshCcw,
};

const estatusConfig: Record<
  EstatusConciliacion,
  { label: string; className: string }
> = {
  conciliado: {
    label: "Conciliado",
    className: "border-success/30 bg-success/10 text-success",
  },
  diferencia: {
    label: "Con diferencia",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  parcial: {
    label: "Parcial",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
};

function formatValor(metrica: Metrica) {
  switch (metrica.formato) {
    case "moneda":
      return formatMoneda(metrica.valor);
    case "porcentaje":
      return formatPorcentaje(metrica.valor);
    default:
      return formatNumero(metrica.valor);
  }
}

function MetricCard({ metrica }: { metrica: Metrica }) {
  const Icon = iconosMetrica[metrica.id] ?? FileText;
  const positiva = metrica.variacion >= 0;
  const Trend = positiva ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardDescription className="text-xs font-medium tracking-wide uppercase">
          {metrica.titulo}
        </CardDescription>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-md border bg-background text-primary">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 px-5">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatValor(metrica)}
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular-nums",
              positiva ? "text-success" : "text-destructive"
            )}
          >
            <Trend className="size-3.5" />
            {positiva ? "+" : ""}
            {formatPorcentaje(metrica.variacion)}
          </span>
          <span className="text-muted-foreground">{metrica.detalle}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const totalPrima = recibosConciliados.reduce((s, r) => s + r.primaTotal, 0);
  const totalComision = recibosConciliados.reduce((s, r) => s + r.comision, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Resumen Directivo
          </h1>
          <p className="text-sm text-muted-foreground">
            Indicadores clave de cartera, cobranza y comisiones.
          </p>
        </div>
        <Button>
          <Download />
          Exportar reporte
        </Button>
      </div>

      <section
        aria-label="Métricas principales"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metricas.map((m) => (
          <MetricCard key={m.id} metrica={m} />
        ))}
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Últimos Recibos Conciliados</CardTitle>
          <CardDescription>
            Pagos aplicados contra estados de cuenta de aseguradoras.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm">
              Ver conciliación
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Folio</TableHead>
                <TableHead>Póliza</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aseguradora</TableHead>
                <TableHead>Ramo</TableHead>
                <TableHead>Fecha de pago</TableHead>
                <TableHead className="text-right">Prima total</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
                <TableHead className="pr-5">Estatus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recibosConciliados.map((r) => {
                const estatus = estatusConfig[r.estatus];
                return (
                  <TableRow key={r.folio}>
                    <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                      {r.folio}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.poliza}</TableCell>
                    <TableCell className="max-w-[240px] truncate font-medium">
                      {r.cliente}
                    </TableCell>
                    <TableCell>{r.aseguradora}</TableCell>
                    <TableCell className="text-muted-foreground">{r.ramo}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatFecha(r.fechaPago)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoneda(r.primaTotal)}
                    </TableCell>
                    <TableCell className="text-right text-primary tabular-nums">
                      {formatMoneda(r.comision)}
                    </TableCell>
                    <TableCell className="pr-5">
                      <Badge variant="outline" className={estatus.className}>
                        {estatus.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="pl-5 text-muted-foreground">
                  {recibosConciliados.length} recibos
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoneda(totalPrima)}
                </TableCell>
                <TableCell className="text-right font-semibold text-primary tabular-nums">
                  {formatMoneda(totalComision)}
                </TableCell>
                <TableCell className="pr-5" />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
