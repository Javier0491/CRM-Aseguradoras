import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, MessageCircle, RefreshCcw, Send, TrendingUp, XCircle } from "lucide-react";

import { FiltroEjecutivo } from "@/components/layout/filtro-ejecutivo";
import { numeroWhatsApp } from "@/components/layout/barra-acciones-movil";
import { AseguradoraTag, RamoBadge } from "@/components/polizas/poliza-ui";
import { MoverEtapa } from "@/components/renovaciones/mover-etapa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAgencia } from "@/lib/agencias/queries";
import { requireUser } from "@/lib/auth/dal";
import { formatFecha, formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
import { getEmbudo, type TarjetaEmbudo } from "@/lib/renovaciones/queries";
import { DIAS_EMBUDO, DIAS_VENCIDAS_EMBUDO, urgenciaRenovacion, type ColumnaEmbudo } from "@/lib/renovaciones/reglas";
import { getEjecutivos } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Renovaciones",
};

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

export default async function RenovacionesPage({ searchParams }: PageProps<"/renovaciones">) {
  const params = await searchParams;
  const ejecutivo = typeof params.ejecutivo === "string" ? params.ejecutivo.slice(0, 64) : "";
  const user = await requireUser();
  const [{ hoy, columnas, total }, ejecutivos, agencia] = await Promise.all([
    getEmbudo({ ejecutivo: ejecutivo || undefined }),
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
    getAgencia(user.agenciaId),
  ]);
  const col = Object.fromEntries(columnas.map((c) => [c.clave, c])) as Record<ColumnaEmbudo, (typeof columnas)[number]>;
  const enJuego = col.por_renovar.prima + col.cotizando.prima + col.enviada.prima;
  const cerradas = col.renovada.polizas.length + col.perdida.polizas.length;
  const tasa = cerradas > 0 ? (col.renovada.polizas.length / cerradas) * 100 : null;

  const resumen = [
    {
      label: "Prima en juego",
      valor: formatMoneda(enJuego),
      detalle: `${formatNumero(col.por_renovar.polizas.length + col.cotizando.polizas.length + col.enviada.polizas.length)} pólizas por cerrar`,
    },
    {
      label: "Renovadas",
      valor: formatMoneda(col.renovada.prima),
      detalle: `${formatNumero(col.renovada.polizas.length)} pólizas`,
    },
    {
      label: "Perdidas",
      valor: formatMoneda(col.perdida.prima),
      detalle: `${formatNumero(col.perdida.polizas.length)} pólizas`,
    },
    {
      label: "Tasa de renovación",
      valor: tasa === null ? "—" : formatPorcentaje(tasa),
      detalle: "de las renovaciones ya cerradas",
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Renovaciones</h1>
          <p className="text-sm text-muted-foreground">
            Pólizas que vencen en los próximos {DIAS_EMBUDO} días o que vencieron hace menos de {DIAS_VENCIDAS_EMBUDO}, y
            las que están en seguimiento.
          </p>
        </div>
        {ejecutivos && <FiltroEjecutivo ejecutivos={ejecutivos} usuarioId={user.id} valor={ejecutivo} />}
      </div>

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumen.map((r) => (
          <Card key={r.label} className="gap-1 px-5 py-4">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{r.valor}</p>
            <p className="text-xs text-muted-foreground">{r.detalle}</p>
          </Card>
        ))}
      </section>

      {total === 0 ? (
        <Card className="items-center gap-2 border-dashed py-14 text-center">
          <RefreshCcw className="size-7 text-primary" />
          <p className="font-medium">No hay renovaciones en la ventana</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Aquí aparecerán las pólizas conforme se acerque su fin de vigencia.
          </p>
        </Card>
      ) : (
        // En pantallas angostas las columnas se recorren de lado.
        <div className="-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 xl:mx-0 xl:snap-none xl:px-0">
          <div className="grid w-max grid-flow-col gap-4 xl:w-full xl:grid-flow-row xl:grid-cols-5">
            {columnas.map((c) => {
              const Icono = ICONO_COLUMNA[c.clave];
              return (
                <section
                  key={c.clave}
                  aria-label={c.titulo}
                  className="flex w-[80vw] max-w-[300px] snap-start flex-col rounded-xl border bg-muted/30 xl:w-auto xl:max-w-none"
                >
                  <header className="flex items-start justify-between gap-2 border-b px-3 py-3">
                    <div>
                      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                        <Icono className={cn("size-4", ACENTO_COLUMNA[c.clave])} /> {c.titulo}
                        <span className="rounded-full bg-background px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                          {c.polizas.length}
                        </span>
                      </h2>
                      <p className="text-[11px] text-muted-foreground">{c.descripcion}</p>
                    </div>
                    <p className="text-right text-xs font-medium tabular-nums">{formatMoneda(c.prima)}</p>
                  </header>
                  <ul className="flex flex-col gap-2 p-2">
                    {c.polizas.length === 0 ? (
                      <li className="px-2 py-6 text-center text-xs text-muted-foreground">Sin pólizas</li>
                    ) : (
                      c.polizas.map((p) => <TarjetaRenovacion key={p.id} p={p} agencia={agencia.nombre} />)
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

function TarjetaRenovacion({ p, agencia }: { p: TarjetaEmbudo; agencia: string }) {
  const urgencia = urgenciaRenovacion(p.dias);
  const cerrada = p.columna === "renovada" || p.columna === "perdida";
  const wa = p.cliente.telefono ? numeroWhatsApp(p.cliente.telefono) : null;
  const mensaje =
    `Hola ${p.cliente.nombre}, le escribimos de ${agencia}: su póliza ${p.numeroImpreso} de ${p.aseguradora.nombre} ` +
    `vence el ${formatFecha(p.vigencia_fin)}. ¿Le ayudamos con la renovación?`;

  return (
    <li className="space-y-2 rounded-lg border bg-card p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/polizas/${p.id}`} className="min-w-0 text-sm font-medium hover:text-primary hover:underline">
          <span className="line-clamp-2">{p.cliente.nombre}</span>
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
      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{p.numeroImpreso}</span>
        <span className="font-medium text-foreground tabular-nums">{formatMoneda(p.prima_total)}</span>
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
            Renovada con <span className="font-mono">{p.renovacion.numeroImpreso}</span> <ArrowRight />
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
