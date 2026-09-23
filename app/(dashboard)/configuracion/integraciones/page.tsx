import type { Metadata } from "next";
import { Database, ExternalLink, PlugZap, ServerCog, Unplug } from "lucide-react";

import { ConfigurarApiDialog } from "@/components/integraciones/configurar-api-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { colorTextoSobre, normalizarHex } from "@/lib/color";
import { getAseguradorasIntegracion } from "@/lib/integraciones/queries";
import type { AseguradoraIntegracion } from "@/lib/integraciones/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Integraciones",
};

const estadoConfig: Record<string, { label: string; dot: string; className: string }> = {
  ACTIVA: { label: "Activa", dot: "bg-success", className: "border-success/30 bg-success/10 text-success" },
  ERROR: { label: "Error", dot: "bg-destructive", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  INACTIVA: { label: "Inactiva", dot: "bg-muted-foreground", className: "border-border bg-muted text-muted-foreground" },
};

function estadoDe(estadoApi: string) {
  // Un valor no contemplado se muestra tal cual en lugar de ocultarse como "Inactiva".
  return (
    estadoConfig[estadoApi.toUpperCase()] ?? {
      label: estadoApi,
      dot: "bg-warning",
      className: "border-warning/30 bg-warning/10 text-warning",
    }
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/);
  return (palabras.length > 1 ? palabras[0][0] + palabras[1][0] : nombre.slice(0, 2)).toUpperCase();
}

function AseguradoraCard({ aseguradora }: { aseguradora: AseguradoraIntegracion }) {
  const estado = estadoDe(aseguradora.estado_api);
  const color = normalizarHex(aseguradora.color_hex);

  return (
    <Card className="relative gap-4 overflow-hidden py-5">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-border"
        style={color ? { backgroundColor: color } : undefined}
      />
      <CardHeader className="flex items-center gap-3 px-5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold"
          style={color ? { backgroundColor: color, color: colorTextoSobre(color) } : undefined}
        >
          {iniciales(aseguradora.nombre)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={aseguradora.nombre}>
            {aseguradora.nombre}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {color ?? `color inválido: ${aseguradora.color_hex}`}
          </p>
        </div>
        <Badge variant="outline" className={cn("gap-1.5", estado.className)}>
          <span className={cn("size-1.5 rounded-full", estado.dot)} />
          {estado.label}
        </Badge>
      </CardHeader>

      <CardContent className="px-5">
        <dl className="space-y-2 rounded-md border bg-background/60 p-3 font-mono text-[11px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">estado_api</dt>
            <dd>{aseguradora.estado_api}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">endpoint</dt>
            <dd className="truncate">{aseguradora.api_endpoint ?? "— sin configurar"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">portal</dt>
            <dd className="truncate">
              {aseguradora.url_portal_cobranza ? (
                <a
                  href={aseguradora.url_portal_cobranza}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  {hostname(aseguradora.url_portal_cobranza)}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </CardContent>

      <CardFooter className="px-5">
        <ConfigurarApiDialog aseguradora={aseguradora} />
      </CardFooter>
    </Card>
  );
}

function SinAseguradoras() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Database className="size-8 text-primary" />
        <p className="font-medium">No hay aseguradoras registradas</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Carga el catálogo inicial ejecutando{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npx prisma db seed</code>.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function IntegracionesPage() {
  const aseguradoras = await getAseguradorasIntegracion();

  const total = aseguradoras.length;
  const activas = aseguradoras.filter((a) => a.estado_api.toUpperCase() === "ACTIVA").length;

  const resumen = [
    { label: "Aseguradoras registradas", valor: total, icon: ServerCog },
    { label: "Conexiones activas", valor: activas, icon: PlugZap },
    { label: "Sin conexión", valor: total - activas, icon: Unplug },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Integraciones</h1>
          <p className="text-sm text-muted-foreground">
            Conexiones API oficiales con aseguradoras para automatizar la conciliación.
          </p>
        </div>
        <Badge variant="outline" className="border-primary/30 text-primary">
          Fase 4 · en desarrollo
        </Badge>
      </div>

      <section aria-label="Resumen de conexiones" className="grid gap-4 sm:grid-cols-3">
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

      {total === 0 ? (
        <SinAseguradoras />
      ) : (
        <section
          aria-label="Aseguradoras"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
        >
          {aseguradoras.map((a) => (
            <AseguradoraCard key={a.id} aseguradora={a} />
          ))}
        </section>
      )}
    </>
  );
}
