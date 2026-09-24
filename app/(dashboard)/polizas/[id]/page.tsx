import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileArchive, FileText, FolderOpen } from "lucide-react";

import { ArchivoUploader } from "@/components/archivos/archivo-uploader";
import {
  AseguradoraTag,
  estadoRecibo,
  formaPagoLabel,
  ramoLabel,
  Vencimiento,
} from "@/components/polizas/poliza-ui";
import { Badge } from "@/components/ui/badge";
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
import { ARCHIVOS, formatBytes, TIPOS_ARCHIVO, type TipoArchivo } from "@/lib/archivos/config";
import { formatFecha, formatMoneda, hoyISO } from "@/lib/format";
import { getPolizaDetalle } from "@/lib/polizas/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Detalle de póliza",
};

export default async function PolizaDetallePage({ params }: PageProps<"/polizas/[id]">) {
  const { id } = await params;
  const poliza = await getPolizaDetalle(id);
  if (!poliza) notFound();
  const hoy = hoyISO();

  const datos = [
    { label: "Cliente", valor: poliza.cliente.nombre },
    { label: "RFC", valor: poliza.cliente.rfc, mono: true },
    { label: "Teléfono", valor: poliza.cliente.telefono, mono: true },
    { label: "Correo", valor: poliza.cliente.email },
    { label: "Vigencia", valor: `${formatFecha(poliza.vigencia_inicio)} – ${formatFecha(poliza.vigencia_fin)}` },
    { label: "Prima total", valor: formatMoneda(Number(poliza.prima_total)) },
    { label: "Forma de pago", valor: formaPagoLabel[poliza.forma_pago] },
    { label: "Registrada", valor: formatFecha(poliza.created_at) },
  ];

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/polizas">
            <ArrowLeft /> Pólizas
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-xl font-semibold tracking-tight">{poliza.numeroImpreso}</h1>
            <p className="text-sm text-muted-foreground">
              Póliza vigor{" "}
              <span className="font-mono text-primary">{poliza.polizaVigor ?? "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <AseguradoraTag nombre={poliza.aseguradora.nombre} color={poliza.aseguradora.color_hex} />
            <Badge variant="outline">{ramoLabel[poliza.ramo]}</Badge>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de la póliza</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {datos.map((d) => (
                  <div key={d.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{d.label}</dt>
                    <dd className={cn("truncate text-sm font-medium", d.mono && "font-mono")}>
                      {d.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base">Recibos</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Recibo</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="pr-5">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poliza.recibos.map((r) => {
                  const estado = estadoRecibo[r.estado];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5 text-muted-foreground tabular-nums">
                        {r.numero}/{poliza.recibos.length}
                      </TableCell>
                      <TableCell>
                        <Vencimiento fecha={r.fecha_vencimiento} estado={r.estado} hoy={hoy} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoneda(Number(r.monto))}
                      </TableCell>
                      <TableCell className="pr-5">
                        <Badge variant="outline" className={estado.className}>
                          {estado.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="size-4 text-primary" />
              Documentos
            </CardTitle>
            <CardDescription>Carátula y expediente de respaldo de la póliza.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {TIPOS_ARCHIVO.map((tipo) => (
              <DocumentoPoliza
                key={tipo}
                polizaId={poliza.id}
                tipo={tipo}
                archivo={
                  tipo === "caratula"
                    ? {
                        nombre: poliza.caratula_nombre,
                        bytes: poliza.caratula_bytes,
                        subido: poliza.caratula_subido_at,
                      }
                    : {
                        nombre: poliza.expediente_nombre,
                        bytes: poliza.expediente_bytes,
                        subido: poliza.expediente_subido_at,
                      }
                }
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DocumentoPoliza({
  polizaId,
  tipo,
  archivo,
}: {
  polizaId: string;
  tipo: TipoArchivo;
  archivo: { nombre: string | null; bytes: number | null; subido: Date | null };
}) {
  const Icono = tipo === "caratula" ? FileText : FileArchive;
  // Enlaces normales (no <Link>): la ruta responde con una redirección a Storage.
  const href = `/polizas/${polizaId}/archivos/${tipo}`;

  return (
    <section className="space-y-3 py-4 first:pt-0 last:pb-0">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icono className="size-4 text-muted-foreground" />
        {ARCHIVOS[tipo].etiqueta}
      </h3>
      {archivo.nombre ? (
        <>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="truncate text-sm font-medium">{archivo.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(archivo.bytes ?? 0)}
              {archivo.subido && ` · subido el ${formatFecha(archivo.subido)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tipo === "caratula" ? (
              <>
                <Button asChild size="sm">
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Ver carátula
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`${href}?descargar=1`} download>
                    <Download /> Descargar PDF
                  </a>
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <a href={href} download>
                  <Download /> Descargar ZIP
                </a>
              </Button>
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Reemplazar archivo
            </summary>
            <div className="pt-3">
              <ArchivoUploader polizaId={polizaId} tipo={tipo} reemplazar />
            </div>
          </details>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Sin archivo.</p>
          <ArchivoUploader polizaId={polizaId} tipo={tipo} />
        </>
      )}
    </section>
  );
}
