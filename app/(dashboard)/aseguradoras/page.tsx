import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ExternalLink, FileText, Plug, Wallet } from "lucide-react";

import { ReglasCobranzaDialog } from "@/components/aseguradoras/reglas-cobranza";
import { NumeroAnimado } from "@/components/dashboard/numero-animado";
import { BarraProporcion } from "@/components/layout/barra-proporcion";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { IconoRelieve } from "@/components/layout/icono-relieve";
import { Inclinable } from "@/components/layout/inclinable";
import { TarjetaResumen } from "@/components/layout/tarjeta-resumen";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { monograma } from "@/lib/aseguradoras/monograma";
import { getAseguradorasCatalogo } from "@/lib/aseguradoras/queries";
import { esAdmin, requireUsuarioCrm } from "@/lib/auth/dal";
import { normalizarHex } from "@/lib/color";
import { formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
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
  const [aseguradoras, user] = await Promise.all([getAseguradorasCatalogo(), requireUsuarioCrm()]);
  const puedeEditar = esAdmin(user);
  const totalActivas = aseguradoras.reduce((s, a) => s + a.polizasActivas, 0);
  const primaTotal = aseguradoras.reduce((s, a) => s + a.primaActiva, 0);

  return (
    <>
      <EncabezadoModulo
        icono={Building2}
        titulo="Aseguradoras"
        descripcion={
          <>
            {formatNumero(aseguradoras.length)} compañías · {formatNumero(totalActivas)} pólizas vigentes en cartera.
          </>
        }
      />

      {aseguradoras.length === 0 ? (
        <Card className="border-dashed py-0">
          <EstadoVacio icono={Building2} titulo="Aún no hay aseguradoras registradas" />
        </Card>
      ) : (
        <>
          <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-3">
            <TarjetaResumen titulo="Compañías" valor={formatNumero(aseguradoras.length)} icono={Building2} orden={0} />
            <TarjetaResumen titulo="Pólizas vigentes" valor={formatNumero(totalActivas)} icono={FileText} orden={1} />
            <TarjetaResumen titulo="Prima vigente" valor={formatMoneda(primaTotal)} icono={Wallet} orden={2} />
          </section>

          <section aria-label="Catálogo de aseguradoras" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {aseguradoras.map((a, i) => {
              // Sin color registrado, la compañía se ve en gris.
              const color = normalizarHex(a.color_hex) ?? "#71717a";
              const apiActiva = a.estado_api.toUpperCase() === "ACTIVA";
              const parte = totalActivas > 0 ? a.polizasActivas / totalActivas : 0;
              return (
                <div key={a.id} className="h-full animate-entrar" style={{ animationDelay: `${150 + Math.min(i, 12) * 50}ms` }}>
                  <Inclinable className="group/tarjeta h-full rounded-xl" grados={4}>
                    <Card acento={color} className="h-full gap-4 px-5 py-5">
                      <div className="flex items-start gap-3">
                        <IconoRelieve color={color} texto={monograma(a.nombre)} />
                        <div className="min-w-0 flex-1">
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
                          <dd className="text-2xl font-semibold tabular-nums">
                            <NumeroAnimado valor={formatNumero(a.polizasActivas)} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Prima vigente</dt>
                          <dd className="pt-1.5 text-sm font-medium tabular-nums">{formatMoneda(a.primaActiva)}</dd>
                        </div>
                      </dl>

                      {/* Qué parte de las pólizas vigentes de la cartera es de esta compañía. */}
                      <BarraProporcion
                        etiqueta="Parte de la cartera vigente"
                        valor={formatPorcentaje(parte * 100)}
                        fraccion={parte}
                        color={color}
                        retraso={450 + Math.min(i, 12) * 50}
                      />

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-muted-foreground">
                          {a.diasGracia > 0
                            ? `${a.diasGracia} ${a.diasGracia === 1 ? "día" : "días"} de gracia`
                            : "Sin días de gracia"}
                        </Badge>
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
                      <p className="text-xs text-muted-foreground">
                        {formatNumero(a.polizasTotales)} {a.polizasTotales === 1 ? "póliza registrada" : "pólizas registradas"}{" "}
                        en total ·{" "}
                        <Link href="/configuracion/integraciones" className="hover:text-primary hover:underline">
                          Integración
                        </Link>
                      </p>
                    </Card>
                  </Inclinable>
                </div>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
