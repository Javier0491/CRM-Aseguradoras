import { ViewTransition } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Download,
  MessageCircle,
  Percent,
  RefreshCcw,
  Send,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";

import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { FiltroEjecutivo } from "@/components/layout/filtro-ejecutivo";
import { numeroWhatsApp } from "@/components/layout/barra-acciones-movil";
import { TarjetaResumen, type TonoResumen } from "@/components/layout/tarjeta-resumen";
import { AseguradoraTag, RamoBadge } from "@/components/polizas/poliza-ui";
import { MoverEtapa } from "@/components/renovaciones/mover-etapa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatFecha, formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
import type { getEmbudo, TarjetaEmbudo } from "@/lib/renovaciones/queries";
import { DIAS_EMBUDO, DIAS_VENCIDAS_EMBUDO, urgenciaRenovacion, type ColumnaEmbudo } from "@/lib/renovaciones/reglas";
import type { OpcionEjecutivo } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

const ICONO_COLUMNA: Record<ColumnaEmbudo, typeof CalendarClock> = {
  por_renovar: CalendarClock,
  cotizando: TrendingUp,
  enviada: Send,
  renovada: CheckCircle2,
  perdida: XCircle,
};

const ACENTO_COLUMNA: Record<ColumnaEmbudo, string> = {
  por_renovar: "text-warning",
  cotizando: "text-primary",
  enviada: "text-sky-600 dark:text-sky-400",
  renovada: "text-success",
  perdida: "text-destructive",
};

/** Color de cada etapa: la línea de arriba de la columna y su parte de la prima. */
const BARRA_COLUMNA: Record<ColumnaEmbudo, string> = {
  por_renovar: "bg-warning",
  cotizando: "bg-primary",
  enviada: "bg-sky-500",
  renovada: "bg-success",
  perdida: "bg-destructive",
};

export type DatosRenovaciones = {
  embudo: Awaited<ReturnType<typeof getEmbudo>>;
  /** Nombre de la agencia, para el mensaje de WhatsApp. */
  agencia: string;
  /** Selector de ejecutivo; no aparece para quien solo ve su cartera. */
  filtro?: { ejecutivos: OpcionEjecutivo[]; usuarioId: string; valor: string };
};

/** Embudo de renovaciones: resumen y columnas por etapa. La página carga los datos. */
export function VistaRenovaciones({ embudo: { hoy, columnas, total }, agencia, filtro }: DatosRenovaciones) {
  const col = Object.fromEntries(columnas.map((c) => [c.clave, c])) as Record<ColumnaEmbudo, (typeof columnas)[number]>;
  const enJuego = col.por_renovar.prima + col.cotizando.prima + col.enviada.prima;
  const cerradas = col.renovada.polizas.length + col.perdida.polizas.length;
  const tasa = cerradas > 0 ? (col.renovada.polizas.length / cerradas) * 100 : null;
  const porCerrar = col.por_renovar.polizas.length + col.cotizando.polizas.length + col.enviada.polizas.length;
  const polizas = (n: number) => `${formatNumero(n)} ${n === 1 ? "póliza" : "pólizas"}`;

  // Parte de la prima total del embudo que tiene cada columna (para su barra).
  const primaTotal = columnas.reduce((s, c) => s + c.prima, 0);

  const resumen: { label: string; valor: string; detalle: string; icono: typeof Wallet; tono: TonoResumen }[] = [
    {
      label: "Prima en juego",
      valor: formatMoneda(enJuego),
      detalle: `${polizas(porCerrar)} por cerrar`,
      icono: Wallet,
      tono: "primary",
    },
    {
      label: "Renovadas",
      valor: formatMoneda(col.renovada.prima),
      detalle: polizas(col.renovada.polizas.length),
      icono: CheckCircle2,
      tono: "success",
    },
    {
      label: "Perdidas",
      valor: formatMoneda(col.perdida.prima),
      detalle: polizas(col.perdida.polizas.length),
      icono: XCircle,
      tono: col.perdida.polizas.length > 0 ? "destructive" : "muted",
    },
    {
      label: "Tasa de renovación",
      valor: tasa === null ? "—" : formatPorcentaje(tasa),
      detalle: "de las renovaciones ya cerradas",
      icono: Percent,
      tono: "primary",
    },
  ];

  return (
    <>
      <EncabezadoModulo
        icono={RefreshCcw}
        titulo="Renovaciones"
        descripcion={
          <>
            Pólizas que vencen en los próximos {DIAS_EMBUDO} días o que vencieron hace menos de {DIAS_VENCIDAS_EMBUDO}, y
            las que están en seguimiento.
          </>
        }
        acciones={
          <>
            {filtro && <FiltroEjecutivo ejecutivos={filtro.ejecutivos} usuarioId={filtro.usuarioId} valor={filtro.valor} />}
            <Button asChild variant="outline">
              {/* Descarga: no es una página, así que va con <a> y no con Link. */}
              <a
                href={filtro?.valor ? `/renovaciones/reporte?ejecutivo=${encodeURIComponent(filtro.valor)}` : "/renovaciones/reporte"}
                download
              >
                <Download /> Renovadas en Excel
              </a>
            </Button>
          </>
        }
      />

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumen.map((r, i) => (
          <TarjetaResumen key={r.label} titulo={r.label} valor={r.valor} detalle={r.detalle} icono={r.icono} tono={r.tono} orden={i} />
        ))}
      </section>

      {total === 0 ? (
        <Card className="border-dashed py-0">
          <EstadoVacio
            icono={RefreshCcw}
            titulo="No hay renovaciones en la ventana"
            descripcion="Aquí aparecerán las pólizas conforme se acerque su fin de vigencia."
          />
        </Card>
      ) : (
        // En pantallas angostas las columnas se recorren de lado.
        <div className="-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 xl:mx-0 xl:snap-none xl:px-0">
          <div className="grid w-max grid-flow-col gap-4 xl:w-full xl:grid-flow-row xl:grid-cols-5">
            {columnas.map((c, i) => {
              const Icono = ICONO_COLUMNA[c.clave];
              const parte = primaTotal > 0 ? c.prima / primaTotal : 0;
              return (
                <section
                  key={c.clave}
                  aria-label={c.titulo}
                  style={{ animationDelay: `${200 + i * 70}ms` }}
                  className="relative flex w-[80vw] max-w-[300px] animate-entrar snap-start flex-col overflow-hidden rounded-xl border bg-muted/30 backdrop-blur-sm xl:w-auto xl:max-w-none"
                >
                  {/* Color de la etapa: una línea con brillo arriba de la columna. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 top-0 h-0.5 shadow-[0_0_14px_1px_currentColor]",
                      BARRA_COLUMNA[c.clave],
                      ACENTO_COLUMNA[c.clave]
                    )}
                  />
                  <header className="space-y-2 border-b px-3 pt-3.5 pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <div>
                        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                          <Icono className={cn("size-4", ACENTO_COLUMNA[c.clave])} /> {c.titulo}
                          <span className="rounded-full bg-background px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                            {c.polizas.length}
                          </span>
                        </h2>
                        <p className="text-[11px] text-muted-foreground">{c.descripcion}</p>
                      </div>
                      <p className="ml-auto text-right text-xs font-medium tabular-nums">{formatMoneda(c.prima)}</p>
                    </div>
                    {/* Qué parte de la prima del embudo está en esta etapa. */}
                    <div
                      role="img"
                      aria-label={`${formatPorcentaje(parte * 100)} de la prima del embudo`}
                      className="h-1 overflow-hidden rounded-full bg-background"
                    >
                      <div
                        className={cn("animate-barra h-full rounded-full", BARRA_COLUMNA[c.clave])}
                        style={{ width: `${c.prima > 0 ? Math.max(parte * 100, 2) : 0}%`, animationDelay: `${400 + i * 70}ms` }}
                      />
                    </div>
                  </header>
                  <ul className="flex flex-col gap-2 p-2">
                    {c.polizas.length === 0 ? (
                      <li className="px-2 py-6 text-center text-xs text-muted-foreground">Sin pólizas</li>
                    ) : (
                      c.polizas.map((p, j) => (
                        // Al cambiar de etapa, la tarjeta viaja de su columna a la nueva (misma
                        // identidad en ambas); en cualquier otro cambio no se anima.
                        <ViewTransition key={p.id} name={`renovacion-${p.id}`} share="mover-tarjeta" default="none">
                          <TarjetaRenovacion p={p} agencia={agencia} retraso={300 + i * 70 + Math.min(j, 8) * 40} />
                        </ViewTransition>
                      ))
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Hoy es {formatFecha(`${hoy}T00:00:00Z`)}. «Renovada» se marca sola al capturar la renovación de la póliza; las
        canceladas no aparecen.
      </p>
    </>
  );
}

const ESTILO_URGENCIA = {
  vencida: "border-destructive/40 bg-destructive/10 text-destructive",
  critica: "border-destructive/30 bg-destructive/5 text-destructive",
  pronto: "border-warning/40 bg-warning/10 text-warning",
  a_tiempo: "border-border bg-background text-muted-foreground",
} as const;

/** Franja izquierda según la urgencia: se ve de un vistazo qué atender primero. */
const FRANJA_URGENCIA = {
  vencida: "before:bg-destructive",
  critica: "before:bg-destructive/70",
  pronto: "before:bg-warning",
  a_tiempo: "before:bg-transparent",
} as const;

function TarjetaRenovacion({ p, agencia, retraso }: { p: TarjetaEmbudo; agencia: string; retraso: number }) {
  const urgencia = urgenciaRenovacion(p.dias);
  const cerrada = p.columna === "renovada" || p.columna === "perdida";
  const wa = p.cliente.telefono ? numeroWhatsApp(p.cliente.telefono) : null;
  const mensaje =
    `Hola ${p.cliente.nombre}, le escribimos de ${agencia}: su póliza ${p.numeroImpreso} de ${p.aseguradora.nombre} ` +
    `vence el ${formatFecha(p.vigencia_fin)}. ¿Le ayudamos con la renovación?`;

  return (
    // data-slot="card" y su capa de luz (primero, por space-y): refleja el cursor como las demás tarjetas.
    <li
      data-slot="card"
      style={{ animationDelay: `${retraso}ms` }}
      className={cn(
        "relative isolate animate-entrar space-y-2 rounded-lg border bg-card p-3 shadow-xs transition-[translate,box-shadow,border-color] duration-200 ease-out",
        "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:hover:translate-y-0",
        !cerrada && FRANJA_URGENCIA[urgencia]
      )}
    >
      <span data-slot="card-luz" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <Link
          href={`/polizas/${p.id}`}
          title={p.cliente.nombre}
          className="min-w-0 text-sm font-medium hover:text-primary hover:underline"
        >
          <span className="line-clamp-2 wrap-anywhere">{p.cliente.nombre}</span>
        </Link>
        {!cerrada && (
          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums", ESTILO_URGENCIA[urgencia])}>
            {p.dias < 0 ? `Venció hace ${-p.dias} d` : p.dias === 0 ? "Vence hoy" : `En ${p.dias} d`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
        <RamoBadge ramo={p.ramo} />
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted-foreground">
        <span className="min-w-0 font-mono wrap-anywhere">{p.numeroImpreso}</span>
        <span className="ml-auto font-medium text-foreground tabular-nums">{formatMoneda(p.prima_total)}</span>
      </p>
      <p className="text-[11px] text-muted-foreground">
        Vence el {formatFecha(p.vigencia_fin)}
        {p.ejecutivo && ` · ${p.ejecutivo.nombre}`}
      </p>
      {p.renovacionNota && !p.renovacion && (
        <p className={cn("rounded-md bg-muted px-2 py-1 text-[11px]", p.columna === "perdida" && "text-destructive")}>
          {p.renovacionNota}
        </p>
      )}
      {p.renovacion ? (
        <Button asChild variant="ghost" size="sm" className="h-7 w-full justify-between px-2 text-xs text-success">
          <Link href={`/polizas/${p.renovacion.id}`}>
            Renovada con{" "}
            <span className="min-w-0 truncate font-mono" title={p.renovacion.numeroImpreso}>
              {p.renovacion.numeroImpreso}
            </span>{" "}
            <ArrowRight />
          </Link>
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <MoverEtapa polizaId={p.id} numero={p.numeroImpreso} actual={p.columna} compacto />
          {p.columna !== "perdida" && (
            <Button asChild size="sm" className="h-7 px-2 text-xs">
              <Link href={`/captura?renovar=${p.id}`}>
                <RefreshCcw /> Renovar
              </Link>
            </Button>
          )}
          {wa && (
            <Button asChild variant="ghost" size="icon" className="ml-auto size-7 hover:text-success">
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp a ${p.cliente.nombre}`}
                title="Contactar por WhatsApp"
              >
                <MessageCircle className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
