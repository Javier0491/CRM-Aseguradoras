import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ExternalLink, Plug } from "lucide-react";

import { ReglasCobranzaDialog } from "@/components/aseguradoras/reglas-cobranza";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAseguradorasCatalogo } from "@/lib/aseguradoras/queries";
import { esAdmin, requireUser } from "@/lib/auth/dal";
import { normalizarHex } from "@/lib/color";
import { formatMoneda, formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Aseguradoras",
};

/** Dominio legible del portal (sin protocolo ni "www."). */
function dominio(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Solo se enlazan URLs http(s): el valor viene de la base de datos. */
const esUrlWeb = (url: string) => /^https?:\/\//i.test(url.trim());

export default async function AseguradorasPage() {
  const [aseguradoras, user] = await Promise.all([getAseguradorasCatalogo(), requireUser()]);
  const puedeEditar = esAdmin(user);
  const totalActivas = aseguradoras.reduce((s, a) => s + a.polizasActivas, 0);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Aseguradoras</h1>
        <p className="text-sm text-muted-foreground">
          {formatNumero(aseguradoras.length)} compañías · {formatNumero(totalActivas)} pólizas vigentes en
          cartera.
        </p>
      </div>

      {aseguradoras.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="size-8 text-primary" />
            <p className="font-medium">Aún no hay aseguradoras registradas</p>
          </CardContent>
        </Card>
      ) : (
        <section aria-label="Catálogo de aseguradoras" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {aseguradoras.map((a) => {
            const color = normalizarHex(a.color_hex);
            const apiActiva = a.estado_api.toUpperCase() === "ACTIVA";
            return (
              <Card key={a.id} className="relative gap-4 overflow-hidden px-5 py-5">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1 bg-muted-foreground"
                  style={color ? { backgroundColor: color } : undefined}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{a.nombre}</h2>
                    {a.url_portal_cobranza && esUrlWeb(a.url_portal_cobranza) ? (
                      <a
                        href={a.url_portal_cobranza}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                      >
                        <span className="truncate">Portal: {dominio(a.url_portal_cobranza)}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin datos de contacto</p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 gap-1",
                      apiActiva ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
                    )}
                  >
                    <Plug className="size-3" /> API {apiActiva ? "activa" : "inactiva"}
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-3 border-t pt-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Pólizas vigentes</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{formatNumero(a.polizasActivas)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Prima vigente</dt>
                    <dd className="pt-1.5 text-sm font-medium tabular-nums">{formatMoneda(a.primaActiva)}</dd>
                  </div>
                </dl>
                {(!a.usaPolizaVigor || a.ignoraRecibosDuplicados || puedeEditar) && (
                  <div className="-mt-1 flex flex-wrap items-center gap-1.5">
                    {!a.usaPolizaVigor && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Sin póliza vigor
                      </Badge>
                    )}
                    {a.ignoraRecibosDuplicados && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Ignora recibos duplicados
                      </Badge>
                    )}
                    {puedeEditar && (
                      <span className="ml-auto">
                        <ReglasCobranzaDialog aseguradora={a} />
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatNumero(a.polizasTotales)} {a.polizasTotales === 1 ? "póliza registrada" : "pólizas registradas"}{" "}
                  en total ·{" "}
                  <Link href="/configuracion/integraciones" className="hover:text-primary hover:underline">
                    Integración
                  </Link>
                </p>
              </Card>
            );
          })}
        </section>
      )}
    </>
  );
}
