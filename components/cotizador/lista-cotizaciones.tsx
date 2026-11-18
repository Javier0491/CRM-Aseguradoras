"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Bot, ChevronDown, Clock, FileDown, Layers, Loader2, RotateCcw, TriangleAlert, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cancelarSolicitudCotizacion, reintentarSolicitudCotizacion } from "@/lib/cotizador/actions";
import type { SolicitudVista } from "@/lib/cotizador/queries";
import { nombreAseguradora } from "@/lib/cotizador/aseguradoras";
import { agruparSolicitudes } from "@/lib/cotizador/comparativo";
import {
  ETIQUETA_FORMA_PAGO,
  ETIQUETA_PAQUETE,
  ETIQUETA_PROCEDENCIA,
  ETIQUETA_TIPO_VEHICULO,
  ETIQUETA_VALOR,
  EXTRAS,
} from "@/lib/cotizador/reglas";
import { formatMoneda, formatNumero } from "@/lib/format";
import type { EstadoCotizacion } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ESTADO: Record<EstadoCotizacion, { etiqueta: string; clase: string }> = {
  PENDIENTE: { etiqueta: "En espera", clase: "border-border bg-muted text-muted-foreground" },
  COTIZANDO: { etiqueta: "Cotizando", clase: "border-primary/30 bg-primary/10 text-primary" },
  LISTA: { etiqueta: "Lista", clase: "border-success/30 bg-success/10 text-success" },
  ERROR: { etiqueta: "No se pudo", clase: "border-destructive/30 bg-destructive/10 text-destructive" },
  CANCELADA: { etiqueta: "Cancelada", clase: "border-border bg-muted text-muted-foreground" },
};

/** Cada cuánto se revisa si el robot avanzó mientras hay cotizaciones en curso. */
const REFRESCO_MS = 10_000;

const hora = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });


function Detalle({ s }: { s: SolicitudVista }) {
  const r = s.resultado;
  const k = s.datos.coberturas;
  return (
    <div className="space-y-4 border-t px-4 py-4 text-sm">
      {r ? (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {r.numeroCotizacion && <span>Cotización {nombreAseguradora(s.aseguradora)}: <b className="text-foreground">{r.numeroCotizacion}</b></span>}
            {r.sumaAseguradaVehiculo !== null && <span>Suma asegurada del auto: {formatMoneda(r.sumaAseguradaVehiculo)}</span>}
            {r.bonificacion !== null && <span>Bonificación técnica: {r.bonificacion}%</span>}
          </div>
          {r.coberturas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Cobertura</th>
                    <th className="py-1 pr-3 font-normal">Suma asegurada</th>
                    <th className="py-1 pr-3 font-normal">Deducible</th>
                    <th className="py-1 text-right font-normal">Prima</th>
                  </tr>
                </thead>
                <tbody>
                  {r.coberturas.map((c) => (
                    <tr key={c.cobertura} className="border-t">
                      <td className="py-1.5 pr-3">{c.cobertura}</td>
                      <td className="py-1.5 pr-3">{c.sumaAsegurada ?? "—"}</td>
                      <td className="py-1.5 pr-3">{c.deducible ?? "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.prima === null ? "—" : formatMoneda(c.prima)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {r.primaNeta !== null && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Prima neta</dt><dd className="tabular-nums">{formatMoneda(r.primaNeta)}</dd></div>
            )}
            {r.derechoPoliza !== null && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Derecho de póliza</dt><dd className="tabular-nums">{formatMoneda(r.derechoPoliza)}</dd></div>
            )}
            {r.iva !== null && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">IVA</dt><dd className="tabular-nums">{formatMoneda(r.iva)}</dd></div>
            )}
            {r.otrasFormasPago.map((o) => (
              <div key={o.formaPago} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{ETIQUETA_FORMA_PAGO[o.formaPago]}</dt>
                <dd className="tabular-nums">{formatMoneda(o.primaTotal)}</dd>
              </div>
            ))}
          </dl>
          {r.avisos.length > 0 && (
            <ul className="space-y-1 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              {r.avisos.map((a) => (
                <li key={a} className="flex gap-2"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{a}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {ETIQUETA_PAQUETE[k.paquete]} · DM {k.deducibleDM}% · RT {k.deducibleRT}%
          {k.responsabilidadCivil !== null && ` · RC $${formatNumero(k.responsabilidadCivil)}`}
          {k.bonificacionMaxima && " · bonificación máxima"} · {ETIQUETA_FORMA_PAGO[s.datos.formaPago]}
          {k.rcDanosOcupantes !== null && ` · RC ocupantes $${formatNumero(k.rcDanosOcupantes)}`}
          {k.rcComplementariaPersonas !== null && ` · RC complementaria $${formatNumero(k.rcComplementariaPersonas)}`}
          {(k.extras ?? []).map((x) => ` · ${EXTRAS[x] ?? x}`)}
        </p>
      )}
      {s.datos.vehiculo.tipo && (
        <p className="text-xs text-muted-foreground">
          {ETIQUETA_TIPO_VEHICULO[s.datos.vehiculo.tipo]} · {ETIQUETA_PROCEDENCIA[s.datos.vehiculo.procedencia]} ·{" "}
          {ETIQUETA_VALOR[s.datos.vehiculo.valor]} · {s.datos.tipoPersona === "MORAL" ? "Persona moral" : "Persona física"} · vigencia
          desde {s.datos.vigenciaInicio}
        </p>
      )}
      {s.tienePdf && (
        <Button asChild variant="outline" size="sm">
          <a href={`/cotizador/${s.id}/pdf`} download>
            <FileDown /> Descargar PDF de {nombreAseguradora(s.aseguradora)}
          </a>
        </Button>
      )}
      {s.datos.notas && <p className="text-xs"><span className="text-muted-foreground">Extras pedidos: </span>{s.datos.notas}</p>}
      {s.error && <p className="text-xs text-destructive">{s.error}</p>}
      <p className="text-[11px] text-muted-foreground">
        Precio de la aseguradora al momento de cotizar; puede cambiar al emitir.
        {s.pedidaPor && ` Pedida por ${s.pedidaPor}.`}
      </p>
    </div>
  );
}

export function ListaCotizaciones({ solicitudes }: { solicitudes: SolicitudVista[] }) {
  const router = useRouter();
  const [abierta, setAbierta] = React.useState<string | null>(null);
  const [ocupada, setOcupada] = React.useState<string | null>(null);
  const enCurso = solicitudes.some((s) => s.estado === "PENDIENTE" || s.estado === "COTIZANDO");
  const grupos = React.useMemo(() => agruparSolicitudes(solicitudes), [solicitudes]);

  // Mientras el robot trabaja, la lista se actualiza sola.
  React.useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => router.refresh(), REFRESCO_MS);
    return () => clearInterval(t);
  }, [enCurso, router]);

  async function accion(id: string, fn: (id: string) => Promise<{ ok: boolean; error?: string }>, listo: string) {
    setOcupada(id);
    try {
      const r = await fn(id);
      if (r.ok) toast.success(listo);
      else toast.error(r.error ?? "No se pudo.");
    } catch {
      toast.error("Sin conexión. Intenta de nuevo.");
    } finally {
      setOcupada(null);
    }
  }

  /** Renglón de una solicitud. En un comparativo el título es la aseguradora (el auto va arriba). */
  const fila = (s: SolicitudVista, enGrupo: boolean, mejor: boolean) => {
    const est = ESTADO[s.estado];
    const v = s.datos.vehiculo;
    const abiertaEsta = abierta === s.id;
    return (
      <div key={s.id} className={cn(!enGrupo && "rounded-lg border", enGrupo && "border-t first:border-t-0")}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setAbierta(abiertaEsta ? null : s.id)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-expanded={abiertaEsta}
          >
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abiertaEsta && "rotate-180")} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-medium">
                {enGrupo ? nombreAseguradora(s.aseguradora) : `${v.marca} ${v.modelo} ${v.version} ${v.anio}`}
                {mejor && (
                  <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
                    <Trophy className="size-3" /> Más barata
                  </Badge>
                )}
              </p>
              {!enGrupo && (
                <p className="truncate text-xs text-muted-foreground">
                  {nombreAseguradora(s.aseguradora)} · {s.datos.conductor.nombre ?? `C.P. ${s.datos.conductor.codigoPostal}`} ·{" "}
                  {hora.format(new Date(s.createdAt))}
                </p>
              )}
            </div>
          </button>
          <div className="flex items-center gap-2">
            {s.resultado && (
              <span className="text-right">
                <span className="block font-semibold tabular-nums">{formatMoneda(s.resultado.primaTotal)}</span>
                <span className="block text-[11px] text-muted-foreground">{ETIQUETA_FORMA_PAGO[s.resultado.formaPago]}</span>
              </span>
            )}
            {s.tienePdf && (
              <Button asChild variant="ghost" size="icon-sm" title={`PDF de ${nombreAseguradora(s.aseguradora)}`}>
                <a href={`/cotizador/${s.id}/pdf`} download aria-label={`Descargar PDF de ${nombreAseguradora(s.aseguradora)}`}>
                  <FileDown />
                </a>
              </Button>
            )}
            <Badge variant="outline" className={cn("gap-1", est.clase)}>
              {s.estado === "COTIZANDO" && <Loader2 className="size-3 animate-spin" />}
              {s.estado === "PENDIENTE" && <Clock className="size-3" />}
              {est.etiqueta}
            </Badge>
            {(s.estado === "PENDIENTE" || s.estado === "COTIZANDO") && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Cancelar"
                disabled={ocupada === s.id}
                onClick={() => accion(s.id, cancelarSolicitudCotizacion, "Cotización cancelada")}
              >
                <Ban />
              </Button>
            )}
            {(s.estado === "ERROR" || s.estado === "CANCELADA") && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Volver a intentar"
                disabled={ocupada === s.id}
                onClick={() => accion(s.id, reintentarSolicitudCotizacion, "De vuelta en la fila")}
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        </div>
        {abiertaEsta && <Detalle s={s} />}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Cotizaciones</CardTitle>
        {enCurso && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Se actualiza sola
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {solicitudes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Bot className="size-7 text-primary" />
            Todavía no hay cotizaciones. Llena el formulario y el robot de la oficina la hará en el portal.
          </div>
        ) : (
          grupos.map((g) => {
            if (g.solicitudes.length === 1) return fila(g.solicitudes[0], false, false);
            const primera = g.solicitudes[0];
            const v = primera.datos.vehiculo;
            const listas = g.solicitudes.filter((s) => s.resultado).length;
            return (
              <div key={g.clave} className="rounded-lg border">
                <div className="flex items-start gap-3 bg-muted/40 px-4 py-3">
                  <Layers className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {v.marca} {v.modelo} {v.version} {v.anio}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Comparativo · {listas} de {g.solicitudes.length} listas ·{" "}
                      {primera.datos.conductor.nombre ?? `C.P. ${primera.datos.conductor.codigoPostal}`} ·{" "}
                      {hora.format(new Date(primera.createdAt))}
                    </p>
                  </div>
                </div>
                {g.solicitudes.map((s, i) => fila(s, true, i === 0 && listas > 1 && s.resultado !== null))}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
