import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { GestionAclaracion } from "@/components/conciliacion/gestion-aclaracion";
import { AseguradoraTag } from "@/components/polizas/poliza-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { getAclaraciones } from "@/lib/conciliacion/aclaraciones";
import { formatFecha, formatMoneda } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Aclaraciones de comisión",
};

export default async function AclaracionesPage() {
  await requireAdmin();
  const aclaraciones = await getAclaraciones();
  const porCobrar = aclaraciones.reduce((s, a) => s + (a.diferencia !== null && a.diferencia < 0 ? -a.diferencia : 0), 0);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/conciliacion">
            <ArrowLeft /> Conciliación
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Aclaraciones de comisión</h1>
            <p className="text-sm text-muted-foreground">
              Recibos cobrados cuya comisión no coincidió con la esperada. Reclama a la aseguradora, registra
              pagos adicionales o acepta la diferencia.
            </p>
          </div>
          {porCobrar > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Comisión faltante</p>
              <p className="text-lg font-semibold text-warning tabular-nums">{formatMoneda(porCobrar)}</p>
            </div>
          )}
        </div>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">
            {aclaraciones.length} {aclaraciones.length === 1 ? "recibo por aclarar" : "recibos por aclarar"}
          </CardTitle>
          <CardDescription>Del vencimiento más antiguo al más reciente.</CardDescription>
        </CardHeader>
        {aclaraciones.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <p className="font-medium">No hay diferencias de comisión pendientes</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cuando una conciliación registre un recibo como Pagado con diferencia, aparecerá aquí.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Póliza</TableHead>
                <TableHead>Aseguradora</TableHead>
                <TableHead>Recibo</TableHead>
                <TableHead className="text-right">Esperada</TableHead>
                <TableHead className="text-right">Pagada</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead>Seguimiento</TableHead>
                <TableHead className="pr-5">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aclaraciones.map((a) => {
                const ultima = a.notas[0];
                return (
                  <TableRow key={a.id}>
                    <TableCell className="pl-5">
                      <Link href={`/polizas/${a.poliza.id}`} className="font-mono text-sm hover:text-primary hover:underline">
                        {a.poliza.numero}
                      </Link>
                      <p className="max-w-[200px] truncate text-xs text-muted-foreground">{a.cliente}</p>
                    </TableCell>
                    <TableCell>
                      <AseguradoraTag nombre={a.aseguradora.nombre} color={a.aseguradora.color_hex} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.numero}/{a.total}
                      <p className="text-[11px] text-muted-foreground">
                        {formatFecha(a.fechaVencimiento)}
                        {a.folio && ` · folio ${a.folio}`}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.esperada !== null ? (
                        <>
                          {formatMoneda(a.esperada)}
                          <p className="text-[11px] text-muted-foreground">{a.porcentaje}%</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{a.motivoSinEsperada}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoneda(a.pagada)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        a.diferencia !== null && (a.diferencia < 0 ? "text-destructive" : "text-warning")
                      )}
                    >
                      {a.diferencia === null ? "—" : `${a.diferencia > 0 ? "+" : ""}${formatMoneda(a.diferencia)}`}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <Badge
                        variant="outline"
                        className={
                          a.seguimiento === "reclamada"
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                            : "border-warning/30 bg-warning/10 text-warning"
                        }
                      >
                        {a.seguimiento === "reclamada" ? "Reclamada" : "Por aclarar"}
                      </Badge>
                      {ultima && <p className="mt-1 truncate text-[11px] text-muted-foreground">{ultima.texto}</p>}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <GestionAclaracion aclaracion={a} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
