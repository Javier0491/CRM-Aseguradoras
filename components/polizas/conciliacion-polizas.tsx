// Pólizas → Conciliadas / Sin conciliar: estado de conciliación de la cartera.
import Link from "next/link";
import { CheckCircle2, Download, FileSearch, SearchX } from "lucide-react";

import { AseguradoraTag, RamoBadge } from "@/components/polizas/poliza-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFecha, formatMoneda, formatNumero } from "@/lib/format";
import type { EstadoConciliacion } from "@/lib/polizas/conciliacion";
import {
  etiquetaMotivo,
  etiquetaNoEncontrada,
  TIPOS_MOTIVO,
  type TipoMotivo,
  type TipoNoEncontrada,
} from "@/lib/polizas/conciliacion-motivos";
import { cn } from "@/lib/utils";

const ROJO = "border-destructive/30 bg-destructive/10 text-destructive";
const AMBAR = "border-warning/30 bg-warning/10 text-warning";
const NEUTRO = "border-border bg-muted/40 text-muted-foreground";

const tonoMotivo: Record<TipoMotivo, string> = {
  numero_distinto: ROJO,
  no_aparece: ROJO,
  revisar: AMBAR,
  diferencia: AMBAR,
  aun_no_toca: NEUTRO,
  sin_estado_cuenta: NEUTRO,
};

const tonoNoEncontrada: Record<TipoNoEncontrada, string> = {
  parecida: ROJO,
  no_registrada: ROJO,
  registrada: AMBAR,
};

function Etiqueta({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  );
}

function Vacio({ icono: Icono, titulo, texto }: { icono: typeof SearchX; titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
      <Icono className="size-7 text-muted-foreground" />
      <p className="font-medium">{titulo}</p>
      <p className="max-w-md text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function NotaLimite({ mostrados, total }: { mostrados: number; total: number }) {
  if (total <= mostrados) return null;
  return (
    <p className="border-t px-5 py-3 text-xs text-muted-foreground">
      Mostrando {formatNumero(mostrados)} de {formatNumero(total)}; el reporte descargable las incluye todas.
    </p>
  );
}

export function PolizasConciliadas({
  polizas,
  limite,
}: {
  polizas: EstadoConciliacion["conciliadas"];
  limite: number;
}) {
  if (polizas.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <Vacio
          icono={CheckCircle2}
          titulo="Aún no hay pólizas conciliadas"
          texto="Aparecen aquí cuando al menos uno de sus recibos se concilia con un estado de cuenta en Conciliación de Cobranza."
        />
      </Card>
    );
  }
  const visibles = polizas.slice(0, limite);
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Póliza</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Ramo</TableHead>
            <TableHead>Aseguradora</TableHead>
            <TableHead className="text-right">Recibos conciliados</TableHead>
            <TableHead className="pr-5">Última conciliación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="pl-5">
                <Link href={`/polizas/${p.id}`} className="font-mono text-xs hover:text-primary hover:underline">
                  {p.numeroImpreso}
                </Link>
              </TableCell>
              <TableCell className="max-w-[240px] truncate font-medium">{p.cliente}</TableCell>
              <TableCell>
                <RamoBadge ramo={p.ramo} />
              </TableCell>
              <TableCell>
                <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className={cn(p.conciliados === p.recibos ? "text-success" : "text-foreground")}>
                  {p.conciliados}/{p.recibos}
                </span>
              </TableCell>
              <TableCell className="pr-5 text-muted-foreground tabular-nums">
                {p.ultimaConciliacion ? formatFecha(p.ultimaConciliacion) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <NotaLimite mostrados={visibles.length} total={polizas.length} />
    </Card>
  );
}

export function PolizasSinConciliar({
  polizas,
  noEncontradas,
  verComisiones,
  limite,
}: {
  polizas: EstadoConciliacion["sinConciliar"];
  noEncontradas: EstadoConciliacion["noEncontradas"];
  verComisiones: boolean;
  limite: number;
}) {
  const orden = (t: TipoMotivo) => TIPOS_MOTIVO.indexOf(t);
  const ordenadas = [...polizas].sort((a, b) => orden(a.motivo.tipo) - orden(b.motivo.tipo));
  const visibles = ordenadas.slice(0, limite);
  const porMotivo = TIPOS_MOTIVO.map((t) => ({ tipo: t, cantidad: polizas.filter((p) => p.motivo.tipo === t).length })).filter(
    (m) => m.cantidad > 0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
          <FileSearch className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {formatNumero(polizas.length)} {polizas.length === 1 ? "póliza sin conciliar" : "pólizas sin conciliar"}
            {noEncontradas.length > 0 &&
              ` · ${formatNumero(noEncontradas.length)} ${noEncontradas.length === 1 ? "renglón" : "renglones"} de estados de cuenta sin póliza en el CRM`}
          </p>
          <p className="text-xs text-muted-foreground">
            Descarga el reporte para revisar por qué no se conciliaron: número distinto, póliza no encontrada, diferencias
            o renglones por revisar.
          </p>
        </div>
        <Button asChild size="sm">
          {/* Enlace normal: la ruta responde con el archivo. */}
          <a href="/polizas/reporte-conciliacion" download>
            <Download /> Descargar reporte (Excel)
          </a>
        </Button>
      </div>

      {porMotivo.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {porMotivo.map((m) => (
            <Etiqueta key={m.tipo} className={tonoMotivo[m.tipo]}>
              {etiquetaMotivo[m.tipo]} · {formatNumero(m.cantidad)}
            </Etiqueta>
          ))}
        </div>
      )}

      <Card className="gap-0 py-0">
        {polizas.length === 0 ? (
          <Vacio
            icono={CheckCircle2}
            titulo="Todas las pólizas tienen al menos un recibo conciliado"
            texto="No hay pólizas pendientes de conciliar."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Póliza</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Aseguradora</TableHead>
                  <TableHead className="pr-5">Por qué no se concilió</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-5 align-top">
                      <Link href={`/polizas/${p.id}`} className="font-mono text-xs hover:text-primary hover:underline">
                        {p.numeroImpreso}
                      </Link>
                      {p.numeroEnArchivo && (
                        <p className="font-mono text-[11px] text-destructive">archivo: {p.numeroEnArchivo}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] align-top">
                      <p className="truncate font-medium">{p.cliente}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{p.rfc}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                    </TableCell>
                    <TableCell className="max-w-[460px] pr-5 align-top whitespace-normal">
                      <Etiqueta className={tonoMotivo[p.motivo.tipo]}>{etiquetaMotivo[p.motivo.tipo]}</Etiqueta>
                      <p className="mt-1 text-xs text-muted-foreground">{p.motivo.texto}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <NotaLimite mostrados={visibles.length} total={polizas.length} />
          </>
        )}
      </Card>

      {noEncontradas.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold">Pólizas de los estados de cuenta que no se encontraron en el CRM</h2>
            <p className="text-xs text-muted-foreground">
              La aseguradora reportó comisión de estas pólizas, pero su número no coincide con ninguna póliza capturada.
            </p>
          </div>
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Número en el archivo</TableHead>
                  <TableHead>Aseguradora</TableHead>
                  <TableHead>Estado de cuenta</TableHead>
                  {verComisiones && <TableHead className="text-right">Comisión</TableHead>}
                  <TableHead className="pr-5">Situación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noEncontradas.slice(0, limite).map((r) => (
                  <TableRow key={`${r.aseguradora.nombre}-${r.polizaArchivo}`}>
                    <TableCell className="pl-5 align-top font-mono text-xs">{r.polizaArchivo}</TableCell>
                    <TableCell className="align-top">
                      <AseguradoraTag nombre={r.aseguradora.nombre} color={r.aseguradora.color_hex} />
                    </TableCell>
                    <TableCell className="max-w-[220px] align-top">
                      <p className="truncate text-xs">{r.archivo}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Fila {r.fila} · {formatFecha(r.fecha)}
                        {r.veces > 1 && ` · en ${r.veces} archivos`}
                      </p>
                    </TableCell>
                    {verComisiones && (
                      <TableCell className="text-right align-top tabular-nums">{formatMoneda(r.comisionPagada)}</TableCell>
                    )}
                    <TableCell className="max-w-[420px] pr-5 align-top whitespace-normal">
                      <Etiqueta className={tonoNoEncontrada[r.estado.tipo]}>{etiquetaNoEncontrada[r.estado.tipo]}</Etiqueta>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.estado.texto}
                        {r.poliza && (
                          <>
                            {" "}
                            <Link href={`/polizas/${r.poliza.id}`} className="text-primary hover:underline">
                              Ver póliza
                            </Link>
                          </>
                        )}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <NotaLimite mostrados={Math.min(limite, noEncontradas.length)} total={noEncontradas.length} />
          </Card>
        </section>
      )}
    </div>
  );
}
