import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, FileText, Receipt, Wallet } from "lucide-react";

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
import { normalizarHex } from "@/lib/color";
import type { EstadoRecibo, FormaPago, Ramo } from "@/lib/generated/prisma/client";
import { diasDesdeHoy, formatFecha, formatMoneda, formatNumero, hoyISO } from "@/lib/format";
import { getPolizasListado, getRecibosListado, LIMITE_LISTADO } from "@/lib/polizas/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pólizas",
};

const ramoLabel: Record<Ramo, string> = {
  AUTOS: "Autos",
  GASTOS_MEDICOS: "Gastos Médicos",
  VIDA: "Vida",
  EMPRESARIAL: "Empresarial",
};

const formaPagoLabel: Record<FormaPago, string> = {
  ANUAL: "Anual",
  SEMESTRAL: "Semestral",
  TRIMESTRAL: "Trimestral",
  MENSUAL: "Mensual",
};

const estadoRecibo: Record<EstadoRecibo, { label: string; className: string }> = {
  PENDIENTE: { label: "Pendiente", className: "border-warning/30 bg-warning/10 text-warning" },
  PAGADO: { label: "Pagado", className: "border-success/30 bg-success/10 text-success" },
  CONCILIADO: { label: "Conciliado", className: "border-primary/30 bg-primary/10 text-primary" },
};

function AseguradoraTag({ nombre, color }: { nombre: string; color: string }) {
  const hex = normalizarHex(color);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={hex ? { backgroundColor: hex } : undefined}
      />
      {nombre}
    </span>
  );
}

function Vencimiento({ fecha, estado, hoy }: { fecha: Date; estado: EstadoRecibo; hoy: string }) {
  const dias = diasDesdeHoy(fecha, hoy);
  let nota: React.ReactNode = null;
  if (estado === "PENDIENTE") {
    if (dias < 0) nota = <span className="text-destructive">Vencido hace {-dias} d</span>;
    else if (dias <= 15) nota = <span className="text-warning">{dias === 0 ? "Vence hoy" : `En ${dias} d`}</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="tabular-nums">{formatFecha(fecha)}</span>
      {nota && <span className="text-xs">{nota}</span>}
    </div>
  );
}

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

export default async function PolizasPage() {
  const [{ polizas, total: totalPolizas }, { recibos, total: totalRecibos, pendientes }] =
    await Promise.all([getPolizasListado(), getRecibosListado()]);
  const hoy = hoyISO();

  const resumen = [
    { label: "Pólizas registradas", valor: formatNumero(totalPolizas), icon: FileText },
    { label: "Recibos pendientes", valor: formatNumero(pendientes.cantidad), icon: Receipt },
    { label: "Monto por cobrar", valor: formatMoneda(pendientes.monto), icon: Wallet },
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

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-3">
        {resumen.map((r) => (
          <Card key={r.label} className="flex-row items-center gap-4 px-5 py-4">
            <div className="flex size-9 items-center justify-center rounded-md border bg-background text-primary">
              <r.icon className="size-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{r.valor}</p>
              <p className="text-xs text-muted-foreground">{r.label}</p>
            </div>
          </Card>
        ))}
      </section>

      {totalPolizas === 0 ? (
        <SinDatos />
      ) : (
        <Tabs defaultValue="polizas" className="gap-4">
          <TabsList>
            <TabsTrigger value="polizas">Pólizas · {formatNumero(totalPolizas)}</TabsTrigger>
            <TabsTrigger value="recibos">Recibos · {formatNumero(totalRecibos)}</TabsTrigger>
          </TabsList>

          <TabsContent value="polizas">
            <Card className="gap-0 py-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Póliza</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aseguradora</TableHead>
                    <TableHead>Ramo</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead className="text-right">Prima total</TableHead>
                    <TableHead>Forma de pago</TableHead>
                    <TableHead className="pr-5 text-right">Recibos pagados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {polizas.map((p) => {
                    const cobrados = p.recibos.filter((r) => r.estado !== "PENDIENTE").length;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="pl-5">
                          <p className="font-mono text-xs">{p.numero_poliza_original}</p>
                          {p.numero_poliza_vigor && (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              vigor: {p.numero_poliza_vigor}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <p className="truncate font-medium">{p.cliente.nombre}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{p.cliente.rfc}</p>
                        </TableCell>
                        <TableCell>
                          <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{ramoLabel[p.ramo]}</TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {formatFecha(p.vigencia_inicio)} – {formatFecha(p.vigencia_fin)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoneda(Number(p.prima_total))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formaPagoLabel[p.forma_pago]}</TableCell>
                        <TableCell className="pr-5 text-right tabular-nums">
                          {cobrados}/{p.recibos.length}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
                          {r.poliza.numero_poliza_original}
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
