"use client";

import * as React from "react";
import { CheckCircle2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diasParaVencer, FECHA_CORTE } from "@/lib/comunicaciones/data";
import type { ReciboCobranza } from "@/lib/comunicaciones/plantillas";
import { formatFecha, formatMoneda } from "@/lib/format";
import { situacionCobro, type SituacionCobro } from "@/lib/polizas/gracia";
import { cn } from "@/lib/utils";

export type RegistroEnvio = { plantilla: string; hora: string };

type Filtro = "todos" | SituacionCobro;

function EstadoVencimiento({
  dias,
  situacion,
  fechaLimite,
  diasRestantes,
}: {
  dias: number;
  situacion: SituacionCobro;
  fechaLimite: string;
  diasRestantes: number;
}) {
  if (situacion === "riesgo") {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
        Riesgo de cancelación · venció hace {Math.abs(dias)} d
      </Badge>
    );
  }
  if (situacion === "gracia") {
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
        En gracia hasta el {formatFecha(fechaLimite)} ·{" "}
        {diasRestantes === 0 ? "último día" : `quedan ${diasRestantes} d`}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        dias <= 3
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border text-muted-foreground"
      )}
    >
      {dias === 0 ? "Vence hoy" : `Vence en ${dias} d`}
    </Badge>
  );
}

export function RecibosPanel({
  recibos,
  seleccionado,
  envios,
  onSeleccionar,
  onEnviar,
}: {
  recibos: ReciboCobranza[];
  seleccionado: string;
  envios: Record<string, RegistroEnvio>;
  onSeleccionar: (folio: string) => void;
  onEnviar: (folio: string) => void;
}) {
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

  const conDias = React.useMemo(
    () =>
      recibos
        .map((r) => ({
          ...r,
          dias: diasParaVencer(r.fechaVencimiento),
          ...situacionCobro(r.fechaVencimiento, r.diasGracia, FECHA_CORTE),
        }))
        .sort((a, b) => a.dias - b.dias),
    [recibos]
  );
  const cuantos = (s: SituacionCobro) => conDias.filter((r) => r.situacion === s).length;
  const visibles = filtro === "todos" ? conDias : conDias.filter((r) => r.situacion === filtro);
  const totalVisible = visibles.reduce((s, r) => s + r.monto, 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-3 border-b px-5 py-4 [.border-b]:pb-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Recibos por Vencer / Vencidos</CardTitle>
          <CardDescription>
            Selecciona un recibo para previsualizar el aviso con sus datos.
          </CardDescription>
        </div>
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="todos">Todos · {conDias.length}</TabsTrigger>
            <TabsTrigger value="riesgo">En riesgo · {cuantos("riesgo")}</TabsTrigger>
            <TabsTrigger value="gracia">En gracia · {cuantos("gracia")}</TabsTrigger>
            <TabsTrigger value="por_vencer">Por vencer · {cuantos("por_vencer")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Cliente / Póliza</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Adeudo</TableHead>
              <TableHead className="pr-5 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((r) => {
              const activo = r.folio === seleccionado;
              const envio = envios[r.folio];
              return (
                <TableRow
                  key={r.folio}
                  data-state={activo ? "selected" : undefined}
                  onClick={() => onSeleccionar(r.folio)}
                  className={cn(
                    "cursor-pointer",
                    activo && "bg-primary/[0.06] shadow-[inset_2px_0_0_var(--primary)] hover:bg-primary/[0.08]"
                  )}
                >
                  <TableCell className="max-w-[200px] pl-5">
                    <p className="truncate font-medium">{r.cliente}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {r.poliza} · {r.aseguradora}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-xs tabular-nums">{formatFecha(r.fechaVencimiento)}</span>
                      <EstadoVencimiento
                        dias={r.dias}
                        situacion={r.situacion}
                        fechaLimite={r.fechaLimite}
                        diasRestantes={r.diasRestantes}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoneda(r.monto)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    {envio ? (
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <CheckCircle2 className="size-3.5" /> Enviado {envio.hora}
                        </span>
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEnviar(r.folio);
                          }}
                        >
                          Reenviar
                        </button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant={activo ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEnviar(r.folio);
                        }}
                      >
                        <Send /> Enviar Aviso
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
          <span className="text-muted-foreground">{visibles.length} recibos</span>
          <span className="font-semibold tabular-nums">
            Total: <span className="text-primary">{formatMoneda(totalVisible)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
