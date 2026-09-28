import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FilePlus2, FileText, Fingerprint, Mail, MessageCircle, Phone } from "lucide-react";

import {
  AseguradoraTag,
  EstadoVigenciaBadge,
  estadoVigencia,
  formaPagoLabel,
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
import { getClienteExpediente } from "@/lib/clientes/queries";
import { formatFecha, formatMoneda, formatNumero, hoyISO } from "@/lib/format";
import { DIAS_POR_VENCER } from "@/lib/polizas/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Expediente del cliente",
};

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || nombre.slice(0, 2).toUpperCase();

/** 10 dígitos de México → número internacional para WhatsApp; null si no es utilizable. */
function whatsapp(telefono: string) {
  const d = telefono.replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : null;
}

function DatoContacto({
  icono: Icon,
  etiqueta,
  children,
}: {
  icono: typeof Phone;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border bg-background/60 px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <div className="truncate text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

export default async function ClienteExpedientePage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const cliente = await getClienteExpediente(id);
  if (!cliente) notFound();
  const hoy = hoyISO();

  const estados = cliente.polizas.map((p) => estadoVigencia(p.vigencia_fin, hoy, DIAS_POR_VENCER));
  const conteo = {
    vigente: estados.filter((e) => e === "vigente").length,
    por_vencer: estados.filter((e) => e === "por_vencer").length,
    vencida: estados.filter((e) => e === "vencida").length,
  };
  // Prima de la cartera en vigor (vigentes y por vencer).
  const primaVigente = cliente.polizas
    .filter((_, i) => estados[i] !== "vencida")
    .reduce((s, p) => s + Number(p.prima_total), 0);
  const wa = cliente.telefono ? whatsapp(cliente.telefono) : null;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href="/clientes">
          <ArrowLeft /> Directorio de clientes
        </Link>
      </Button>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-4 border-b border-primary/15 bg-primary/[0.04] px-5 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">
            {iniciales(cliente.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{cliente.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              {formatNumero(cliente.polizas.length)} {cliente.polizas.length === 1 ? "póliza" : "pólizas"} ·{" "}
              {conteo.vigente} {conteo.vigente === 1 ? "vigente" : "vigentes"}
              {conteo.por_vencer > 0 && ` · ${conteo.por_vencer} por vencer`}
              {conteo.vencida > 0 && ` · ${conteo.vencida} ${conteo.vencida === 1 ? "vencida" : "vencidas"}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Prima en vigor</p>
            <p className="text-lg font-semibold text-primary tabular-nums">{formatMoneda(primaVigente)}</p>
          </div>
        </div>
        <CardContent className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <DatoContacto icono={Phone} etiqueta="Teléfono">
            {cliente.telefono ? (
              <span className="flex items-center gap-2">
                <a href={`tel:${cliente.telefono}`} className="tabular-nums hover:text-primary hover:underline">
                  {cliente.telefono}
                </a>
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-success"
                    aria-label={`WhatsApp a ${cliente.nombre}`}
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle className="size-3.5" />
                  </a>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin teléfono</span>
            )}
          </DatoContacto>
          <DatoContacto icono={Mail} etiqueta="Correo">
            {cliente.email ? (
              <a href={`mailto:${cliente.email}`} className="hover:text-primary hover:underline">
                {cliente.email}
              </a>
            ) : (
              <span className="text-muted-foreground">Sin correo</span>
            )}
          </DatoContacto>
          <DatoContacto icono={Fingerprint} etiqueta="RFC">
            <span className="font-mono">{cliente.rfc || "—"}</span>
          </DatoContacto>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" /> Pólizas del cliente
          </CardTitle>
          <CardDescription>Todas sus pólizas registradas, de la vigencia más reciente a la más antigua.</CardDescription>
        </CardHeader>
        {cliente.polizas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <p className="text-sm font-medium">Este cliente no tiene pólizas registradas</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Las pólizas se asocian a su RFC al capturarlas.
            </p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link href="/captura">
                <FilePlus2 /> Capturar póliza
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Póliza</TableHead>
                <TableHead>Aseguradora</TableHead>
                <TableHead>Ramo</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead className="text-right">Prima</TableHead>
                <TableHead className="text-right">Recibos</TableHead>
                <TableHead className="pr-5">Estatus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cliente.polizas.map((p, i) => {
                const cobrados = p.recibos.filter((r) => r.estado !== "PENDIENTE").length;
                return (
                  <TableRow key={p.id} className={cn(estados[i] === "vencida" && "text-muted-foreground")}>
                    <TableCell className="pl-5">
                      <Link
                        href={`/polizas/${p.id}`}
                        className="font-mono text-sm font-medium hover:text-primary hover:underline"
                      >
                        {p.numeroImpreso}
                      </Link>
                      {p.polizaVigor && p.polizaVigor !== p.numeroImpreso && (
                        <p className="font-mono text-[11px] text-muted-foreground">vigor {p.polizaVigor}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                    </TableCell>
                    <TableCell>
                      <RamoBadge ramo={p.ramo} />
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">
                      {formatFecha(p.vigencia_inicio)} – {formatFecha(p.vigencia_fin)}
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="tabular-nums">{formatMoneda(Number(p.prima_total))}</p>
                      <p className="text-[11px] text-muted-foreground">{formaPagoLabel[p.forma_pago]}</p>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {cobrados}/{p.recibos.length}
                    </TableCell>
                    <TableCell className="pr-5">
                      <EstadoVigenciaBadge fin={p.vigencia_fin} hoy={hoy} diasAviso={DIAS_POR_VENCER} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
