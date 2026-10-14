import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Cake,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Eye,
  FilePlus2,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  ListTodo,
  Mail,
  MessageCircle,
  ReceiptText,
  RefreshCcw,
  Scale,
  Send,
  UploadCloud,
  Users,
  type LucideIcon,
} from "lucide-react";

import { NumeroAnimado } from "@/components/dashboard/numero-animado";
import { PeriodoSelector } from "@/components/dashboard/periodo-selector";
import { ProduccionChart } from "@/components/dashboard/produccion-chart";
import { ValorAjustado } from "@/components/dashboard/valor-ajustado";
import { numeroWhatsApp } from "@/components/layout/barra-acciones-movil";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { IconoRelieve } from "@/components/layout/icono-relieve";
import { Inclinable } from "@/components/layout/inclinable";
import { AseguradoraTag, RamoBadge } from "@/components/polizas/poliza-ui";
import { ListaTareas } from "@/components/tareas/lista-tareas";
import { NuevaTarea } from "@/components/tareas/nueva-tarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Periodo } from "@/lib/dashboard/periodos";
import { DIAS_CUMPLEANOS, DIAS_PROXIMOS_VENCIMIENTOS, type getDashboard, type getParaHoy } from "@/lib/dashboard/queries";
import { diasDesdeHoy, formatFecha, formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
import { edadAl } from "@/lib/polizas/asegurados";
import type { OpcionEquipo } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  titulo: string;
  icono: LucideIcon;
  /** Valor ya formateado; null cuando no hay datos para calcularlo. */
  valor: string | null;
  /** Variación porcentual contra el mismo tramo del periodo anterior; null si no aplica. */
  variacion: number | null;
  detalle: string;
  /** Sección a la que lleva la tarjeta. */
  href: string;
};

function MetricCard({ titulo, icono: Icon, valor, variacion, detalle, href, orden }: MetricCardProps & { orden: number }) {
  const positiva = (variacion ?? 0) >= 0;
  const Trend = positiva ? ArrowUpRight : ArrowDownRight;

  return (
    // Entrada (CSS) e inclinación 3D (resorte) en elementos distintos: no se pisan el transform.
    <div className="h-full animate-entrar" style={{ animationDelay: `${orden * 60}ms` }}>
      <Inclinable className="group/tarjeta h-full rounded-xl" grados={4}>
        <Link
          href={href}
          className="group block h-full rounded-xl outline-none transition-[scale] duration-200 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]"
        >
          <Card
            acento="var(--color-primary)"
            className={cn(
              "h-full gap-3 py-5 transition-[border-color,box-shadow] duration-150 ease-out",
              "group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10"
            )}
          >
            <CardHeader className="px-5">
              <CardDescription className="text-xs font-medium tracking-wide uppercase">{titulo}</CardDescription>
              <CardAction>
                <IconoRelieve color="var(--color-primary)" icono={Icon} className="size-10" />
              </CardAction>
            </CardHeader>
            <CardContent className="@container space-y-2 px-5">
              <ValorAjustado
                valor={valor ?? "Sin datos"}
                animado={valor !== null}
                className={cn("tracking-tight", valor === null && "text-muted-foreground")}
              />
              <div className="flex items-center gap-2 text-xs">
                {variacion !== null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-medium tabular-nums",
                      positiva ? "text-success" : "text-destructive"
                    )}
                  >
                    <Trend className="size-3.5" />
                    {positiva ? "+" : ""}
                    {formatPorcentaje(variacion)}
                  </span>
                )}
                <span className="text-muted-foreground">{detalle}</span>
                <ArrowRight
                  className="ml-auto size-3.5 shrink-0 -translate-x-1 text-primary opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </div>
            </CardContent>
          </Card>
        </Link>
      </Inclinable>
    </div>
  );
}

type Accion = { href: string; label: string; icono: LucideIcon };

function Vacio({
  icono,
  titulo,
  detalle,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  detalle: string;
  /** Invitación a actuar (p. ej. capturar la primera póliza). */
  accion?: Accion;
}) {
  return (
    <EstadoVacio
      icono={icono}
      tono="muted"
      titulo={titulo}
      descripcion={detalle}
      className="py-10"
      accion={
        accion && (
          <Button variant="outline" size="sm" className="border-primary/30 hover:border-primary/60" asChild>
            <Link href={accion.href}>
              <accion.icono /> {accion.label}
            </Link>
          </Button>
        )
      }
    />
  );
}

type AccionRapida = Accion & { descripcion: string; destacada?: boolean };

/** Atajos a las tareas más frecuentes del broker. */
function AccionesRapidas({ acciones }: { acciones: AccionRapida[] }) {
  return (
    <nav
      aria-label="Acciones rápidas"
      // Una columna por acción en pantallas anchas (3 para ADMIN, 2 para ejecutivos): la fila queda completa.
      className={cn("grid grid-cols-1 gap-3", acciones.length >= 3 ? "lg:grid-cols-3" : "sm:grid-cols-2")}
    >
      {acciones.map(({ href, label, descripcion, icono, destacada }, i) => (
        <div key={label} className="animate-entrar" style={{ animationDelay: `${120 + i * 60}ms` }}>
          <Inclinable className="group/tarjeta h-full rounded-xl" grados={3}>
            <Link
              href={href}
              className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]"
            >
              <Card
                acento="var(--color-primary)"
                className={cn(
                  "h-full flex-row items-center gap-3 px-4 py-3 transition-[border-color,background-color,box-shadow] duration-200 ease-out",
                  destacada
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--color-primary)] group-hover:shadow-[0_14px_32px_-10px_var(--color-primary)]"
                    : "group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10"
                )}
              >
                {/* Destello que cruza la acción principal al pasar el mouse. */}
                {destacada && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 transition-[translate,opacity] duration-700 ease-out group-hover:translate-x-[400%] group-hover:opacity-100 motion-reduce:hidden"
                  />
                )}
                <IconoRelieve
                  // Sobre el fondo de la marca, el relieve va en un tono más oscuro para que se distinga.
                  color={destacada ? "color-mix(in srgb, var(--color-primary) 55%, black)" : "var(--color-primary)"}
                  icono={icono}
                  className="size-10"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span
                    className={cn(
                      "line-clamp-2 block text-xs leading-snug",
                      destacada ? "text-primary-foreground/75" : "text-muted-foreground"
                    )}
                  >
                    {descripcion}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className={cn(
                    "ml-auto size-4 shrink-0 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100",
                    destacada ? "text-primary-foreground" : "text-primary"
                  )}
                />
              </Card>
            </Link>
          </Inclinable>
        </div>
      ))}
    </nav>
  );
}

type Pendiente = {
  titulo: string;
  icono: LucideIcon;
  cantidad: number;
  detalle: string;
  href: string;
  /** Urgente (rojo) si hay algo; si no, aviso (ámbar). */
  urgente?: boolean;
};

/**
 * Tarjetas "Para hoy": lo que requiere acción, con un clic a su pantalla, con el estilo de
 * Aseguradoras en el color de su urgencia (rojo, ámbar o, en cero, verde y apagadas).
 */
function ParaHoy({ pendientes }: { pendientes: Pendiente[] }) {
  return (
    <section aria-label="Para hoy" className="space-y-2">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Para hoy</h2>
      <div className={cn("grid gap-3 sm:grid-cols-2", pendientes.length >= 5 ? "lg:grid-cols-3 2xl:grid-cols-5" : "xl:grid-cols-4")}>
        {pendientes.map((p, i) => {
          const activo = p.cantidad > 0;
          const color = activo ? (p.urgente ? "var(--color-destructive)" : "var(--color-warning)") : "var(--color-success)";
          return (
            <div key={p.titulo} className="animate-entrar" style={{ animationDelay: `${i * 50}ms` }}>
              <Inclinable className="group/tarjeta h-full rounded-xl" grados={4}>
                <Link
                  href={p.href}
                  className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]"
                >
                  <Card
                    acento={color}
                    className={cn(
                      "h-full flex-row items-start gap-3 px-4 py-3 transition-[border-color,box-shadow,opacity] duration-200 ease-out group-hover:shadow-lg",
                      !activo && "opacity-80 group-hover:opacity-100"
                    )}
                  >
                    <span className="relative shrink-0">
                      <IconoRelieve color={color} icono={activo ? p.icono : CheckCircle2} className="size-10" />
                      {/* Lo urgente con pendientes llama la atención con un punto que late. */}
                      {activo && p.urgente && (
                        <span className="absolute -top-1 -right-1 flex size-2.5">
                          <span className="absolute inline-flex size-full rounded-full bg-destructive opacity-75 motion-safe:animate-ping" />
                          <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="min-w-0 text-sm font-medium">{p.titulo}</span>
                        <span
                          className={cn(
                            "text-xl font-semibold tabular-nums",
                            activo ? (p.urgente ? "text-destructive" : "text-warning") : "text-muted-foreground"
                          )}
                        >
                          <NumeroAnimado valor={formatNumero(p.cantidad)} duracion={0.7} />
                        </span>
                      </span>
                      <span className="line-clamp-2 block text-xs text-muted-foreground">
                        {activo ? p.detalle : "Todo al día"}
                      </span>
                    </span>
                  </Card>
                </Link>
              </Inclinable>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export type DatosDashboard = {
  dashboard: Awaited<ReturnType<typeof getDashboard>>;
  paraHoy: Awaited<ReturnType<typeof getParaHoy>>;
  /** Nombre de la agencia, para los mensajes al cliente. */
  agencia: string;
  /** Para asignar tareas; no viene para quien solo ve su cartera. */
  equipo?: OpcionEquipo[];
  periodo: Periodo;
  usuario: {
    id: string;
    email: string | null;
    soloSuCartera: boolean;
    verComisiones: boolean;
    verConciliacion: boolean;
    coordinaTareas: boolean;
  };
};

/** Resumen directivo: para hoy, métricas, producción, cobranza, tareas y vencimientos. La página carga los datos. */
export function VistaDashboard({ dashboard, paraHoy, agencia, equipo, periodo, usuario }: DatosDashboard) {
  // "…que inician vigencia este mes / en el último trimestre / en el año actual"
  const enPeriodo = { mes: "este mes", trimestre: "en el último trimestre", anio: "en el año actual" }[periodo];
  // Las comisiones solo las ve el SUPERADMIN; la conciliación de cobranza, el rol ADMIN.
  const { verComisiones, verConciliacion } = usuario;
  const { rango, hoy, totalPolizas, metricas, produccion, porEjecutivo, recibos, vencimientos } = dashboard;
  const contraAnterior = "vs. periodo anterior";
  const { renovacion } = metricas;

  const { comisiones } = metricas;
  const tarjetas: (MetricCardProps | null)[] = [
    {
      titulo: "Primas Emitidas",
      icono: Landmark,
      valor: formatMoneda(metricas.primas.valor),
      variacion: metricas.primas.variacion,
      detalle: metricas.primas.variacion !== null ? contraAnterior : `pólizas que inician vigencia ${enPeriodo}`,
      href: "/reportes",
    },
    comisiones && {
      titulo: "Comisiones Pendientes",
      icono: HandCoins,
      valor: formatMoneda(comisiones.valor),
      variacion: null,
      detalle:
        comisiones.recibos === 0
          ? `sin recibos pendientes ${enPeriodo}`
          : `${formatNumero(comisiones.recibos)} ${comisiones.recibos === 1 ? "recibo pendiente" : "recibos pendientes"}` +
            (comisiones.sinPorcentaje > 0 ? ` · ${formatNumero(comisiones.sinPorcentaje)} sin matriz` : "") +
            (comisiones.sinPrimaNeta > 0 ? ` · ${formatNumero(comisiones.sinPrimaNeta)} sin prima neta` : ""),
      // Solo la ve el ADMIN (como la conciliación).
      href: "/conciliacion",
    },
    {
      titulo: "Pólizas Activas",
      icono: FileText,
      valor: formatNumero(metricas.activas.valor),
      variacion: metricas.activas.variacion,
      detalle: metricas.activas.variacion !== null ? contraAnterior : "con vigencia en el periodo",
      href: "/polizas",
    },
    {
      titulo: "Tasa de Renovación",
      icono: RefreshCcw,
      valor: renovacion.tasa === null ? null : formatPorcentaje(renovacion.tasa),
      variacion: null,
      detalle:
        renovacion.tasa === null
          ? "Sin vencimientos en el periodo"
          : `${formatNumero(renovacion.renovadas)} de ${formatNumero(renovacion.vencidas)} ${renovacion.vencidas === 1 ? "vencida" : "vencidas"}`,
      href: "/renovaciones",
    },
  ];

  const acciones: AccionRapida[] = [
    { href: "/captura", label: "Capturar póliza", descripcion: "Sube la carátula y la IA la llena", icono: FilePlus2, destacada: true },
    ...(verConciliacion
      ? [{ href: "/conciliacion", label: "Conciliar cobranza", descripcion: "Cruza el estado de cuenta", icono: Scale }]
      : []),
    { href: "/comunicaciones", label: "Enviar comunicado", descripcion: "Correo a uno o a todos tus clientes", icono: Send },
  ];

  const { recibos: rec } = paraHoy;
  const pendientes: Pendiente[] = [
    {
      titulo: "Mis tareas",
      icono: ListTodo,
      cantidad: paraHoy.tareas.total,
      detalle: "Vencidas o para hoy",
      href: "/tareas",
      urgente: paraHoy.tareas.tareas.some((t) => t.vence.toISOString().slice(0, 10) < hoy),
    },
    {
      titulo: "Renovaciones",
      icono: RefreshCcw,
      cantidad: paraHoy.renovaciones.total,
      detalle:
        paraHoy.renovaciones.sinGestionar > 0
          ? `Vencen en 30 días · ${formatNumero(paraHoy.renovaciones.sinGestionar)} sin gestionar`
          : "Vencen en 30 días, en seguimiento",
      href: "/renovaciones",
    },
    {
      titulo: "Recibos vencidos",
      icono: AlertTriangle,
      cantidad: rec.vencidos,
      detalle:
        rec.riesgo > 0
          ? `${formatNumero(rec.riesgo)} en riesgo de cancelación`
          : "Todos dentro de sus días de gracia",
      href: "/polizas?tab=recibos&recibos=vencidos",
      urgente: rec.riesgo > 0,
    },
    {
      titulo: "Vencen esta semana",
      icono: CalendarClock,
      cantidad: rec.semana.cantidad,
      detalle: `Recibos por ${formatMoneda(rec.semana.monto)}`,
      href: "/polizas?tab=recibos&recibos=semana",
    },
    ...(paraHoy.aclaraciones !== null
      ? [
          {
            titulo: "Aclaraciones",
            icono: Scale,
            cantidad: paraHoy.aclaraciones,
            detalle: "Comisiones cobradas con diferencia",
            href: "/conciliacion/aclaraciones",
          },
        ]
      : []),
  ];

  return (
    <>
      <EncabezadoModulo
        icono={LayoutDashboard}
        titulo="Resumen Directivo"
        descripcion={
          <>
            {formatFecha(rango.desde)} – {formatFecha(rango.hasta)} · cartera, producción y cobranza
            {usuario.soloSuCartera && " de tu cartera"}.
          </>
        }
        acciones={<PeriodoSelector periodo={periodo} />}
      />

      <ParaHoy pendientes={pendientes} />

      <AccionesRapidas acciones={acciones} />

      <section
        aria-label="Métricas principales"
        className={cn("grid gap-4 sm:grid-cols-2", comisiones ? "xl:grid-cols-4" : "xl:grid-cols-3")}
      >
        {tarjetas.map((t, i) => t && <MetricCard key={t.titulo} {...t} orden={i} />)}
      </section>

      <div
        className="grid animate-entrar items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        style={{ animationDelay: "320ms" }}
      >
        <div className="min-w-0 space-y-6">
          <Card acento="var(--color-primary)">
            <CardHeader>
              <CardTitle className="text-base">Producción por Aseguradora</CardTitle>
              <CardDescription>Prima emitida de las pólizas que inician vigencia {enPeriodo}.</CardDescription>
            </CardHeader>
            <CardContent>
              {produccion.length === 0 ? (
                <Vacio
                  icono={BarChart3}
                  titulo="Sin producción en el periodo"
                  detalle={
                    totalPolizas === 0
                      ? "Aún no hay pólizas registradas. Captura la primera desde Captura Inteligente."
                      : "Ninguna póliza inicia vigencia en este periodo; prueba con un rango más amplio."
                  }
                  accion={{ href: "/captura", label: "Subir carátula nueva", icono: UploadCloud }}
                />
              ) : (
                <ProduccionChart datos={produccion} />
              )}
            </CardContent>
          </Card>

          {porEjecutivo && porEjecutivo.length > 0 && (
            <Card acento="var(--color-primary)">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-primary" /> Producción por Ejecutivo
                </CardTitle>
                <CardDescription>Prima emitida {enPeriodo} según el ejecutivo responsable de cada póliza.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProduccionChart
                  datos={porEjecutivo.map((e) => ({ aseguradora: e.ejecutivo, prima: e.prima, polizas: e.polizas }))}
                />
              </CardContent>
            </Card>
          )}

          <Card acento="var(--color-primary)" className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base">Últimos Recibos Conciliados</CardTitle>
              <CardDescription>Recibos conciliados en el periodo contra estados de cuenta.</CardDescription>
              {verConciliacion && (
                <CardAction>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/conciliacion">Ver conciliación</Link>
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            {recibos.length === 0 ? (
              <Vacio
                icono={ReceiptText}
                titulo="No hay recibos conciliados recientemente"
                detalle="Cuando se concilien pagos contra los estados de cuenta de las aseguradoras aparecerán aquí."
                accion={
                  verConciliacion ? { href: "/conciliacion", label: "Ir a módulo de cobranza", icono: Scale } : undefined
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Póliza</TableHead>
                    <TableHead>Recibo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aseguradora</TableHead>
                    <TableHead>Ramo</TableHead>
                    <TableHead>Conciliado</TableHead>
                    <TableHead className={cn("text-right", !verComisiones && "pr-5")}>Monto</TableHead>
                    {verComisiones && <TableHead className="pr-5 text-right">Comisión</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recibos.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-52 min-w-36 pl-5 font-mono text-xs whitespace-normal wrap-anywhere">
                        <Link href={`/polizas/${r.poliza.id}`} className="hover:text-primary hover:underline">
                          {r.poliza.numeroImpreso}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {r.numero}/{r.poliza._count.recibos}
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-medium" title={r.poliza.cliente.nombre}>
                        {r.poliza.cliente.nombre}
                      </TableCell>
                      <TableCell className="max-w-52">
                        <AseguradoraTag nombre={r.poliza.aseguradora.nombre} color={r.poliza.aseguradora.color_hex} />
                      </TableCell>
                      <TableCell>
                        <RamoBadge ramo={r.poliza.ramo} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.conciliado_at ? formatFecha(r.conciliado_at) : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", !verComisiones && "pr-5")}>
                        {formatMoneda(Number(r.monto))}
                      </TableCell>
                      {verComisiones && (
                        <TableCell className="pr-5 text-right font-medium text-primary tabular-nums">
                          {r.comision_pagada !== null ? formatMoneda(Number(r.comision_pagada)) : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6 xl:sticky xl:top-20">
          <Card acento="var(--color-primary)" className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTodo className="size-4 text-primary" /> Mis pendientes
              </CardTitle>
              <CardDescription>Tareas vencidas o para hoy.</CardDescription>
              <CardAction>
                <NuevaTarea hoy={hoy} equipo={equipo} usuarioId={usuario.id} etiqueta="Nueva" variante="ghost" className="h-7" />
              </CardAction>
            </CardHeader>
            <ListaTareas
              tareas={paraHoy.tareas.tareas}
              hoy={hoy}
              usuarioId={usuario.id}
              usuarioEmail={usuario.email}
              coordina={usuario.coordinaTareas}
              mostrarResponsable={false}
              vacio="Nada pendiente para hoy."
            />
            {paraHoy.tareas.total > paraHoy.tareas.tareas.length && (
              <Link href="/tareas" className="block border-t px-5 py-2.5 text-xs text-primary hover:underline">
                Ver las {formatNumero(paraHoy.tareas.total)} tareas pendientes
              </Link>
            )}
          </Card>

          {paraHoy.cumpleanos.length > 0 && (
            <Card acento="var(--color-primary)" className="gap-0 py-0">
              <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cake className="size-4 text-primary" /> Cumpleaños
                </CardTitle>
                <CardDescription>Clientes que cumplen años en los próximos {DIAS_CUMPLEANOS} días.</CardDescription>
              </CardHeader>
              <ul className="divide-y">
                {paraHoy.cumpleanos.map((c) => {
                  const wa = c.telefono ? numeroWhatsApp(c.telefono) : null;
                  const edad = (edadAl(c.nacimiento, hoy) ?? 0) + (c.dias === 0 ? 0 : 1);
                  const felicitacion = `¡Feliz cumpleaños, ${c.nombre}! Le desea todo el equipo de ${agencia}.`;
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/clientes/${c.id}`}
                          title={c.nombre}
                          className="block truncate text-sm font-medium hover:text-primary hover:underline"
                        >
                          {c.nombre}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {c.dias === 0 ? "Hoy" : c.dias === 1 ? "Mañana" : `En ${c.dias} días`} · cumple {edad}
                        </p>
                      </div>
                      {wa && (
                        <Button asChild variant="ghost" size="icon" className="size-7 hover:text-success">
                          <a
                            href={`https://wa.me/${wa}?text=${encodeURIComponent(felicitacion)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Felicitar a ${c.nombre} por WhatsApp`}
                            title="Felicitar por WhatsApp"
                          >
                            <MessageCircle className="size-3.5" />
                          </a>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card acento="var(--color-warning)" className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck className="size-4 text-warning" />
                Próximos Vencimientos
              </CardTitle>
              <CardDescription>
                Pólizas que vencen en los próximos {DIAS_PROXIMOS_VENCIMIENTOS} días sin renovación capturada.
              </CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" className="h-7" asChild>
                  <Link href="/renovaciones">Embudo</Link>
                </Button>
              </CardAction>
            </CardHeader>
            {vencimientos.length === 0 ? (
              <Vacio
                icono={CalendarCheck}
                titulo="Sin vencimientos próximos"
                detalle={`Ninguna póliza pendiente de renovar vence en los próximos ${DIAS_PROXIMOS_VENCIMIENTOS} días.`}
                accion={{ href: "/polizas", label: "Ver cartera de pólizas", icono: FileText }}
              />
            ) : (
              <ul className="divide-y">
                {vencimientos.map((p) => {
                  const dias = diasDesdeHoy(p.vigencia_fin, hoy);
                  const vence = formatFecha(p.vigencia_fin);
                  const mensaje =
                    `Hola ${p.cliente.nombre}, le escribimos de ${agencia}: su póliza ${p.numeroImpreso} de ` +
                    `${p.aseguradora.nombre} vence el ${vence}. ¿Le ayudamos con la renovación?`;
                  const whatsapp = numeroWhatsApp(p.cliente.telefono);
                  const correo = p.cliente.email.trim();
                  return (
                    <li
                      key={p.id}
                      className="group relative flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-accent/40 md:flex-nowrap"
                    >
                      <div className="min-w-0 flex-1 basis-36 space-y-1">
                        {/* El enlace cubre toda la fila; los botones de acción quedan por encima. */}
                        <Link
                          href={`/polizas/${p.id}`}
                          title={p.cliente.nombre}
                          className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                        >
                          {p.cliente.nombre}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <RamoBadge ramo={p.ramo} />
                          <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                        </div>
                      </div>
                      {/* Con mouse, las acciones aparecen en el lugar de la fecha: no le quitan espacio al nombre. */}
                      <div className="shrink-0 text-right transition-opacity md:group-focus-within:opacity-0 md:group-hover:opacity-0">
                        <p className="text-xs tabular-nums">{vence}</p>
                        <p className={cn("text-[11px] font-medium", dias <= 7 ? "text-destructive" : "text-warning")}>
                          {dias === 0 ? "Vence hoy" : `En ${dias} d`}
                        </p>
                      </div>
                      {/* En pantallas táctiles siempre visibles; con mouse aparecen al pasar el cursor. */}
                      <div className="relative z-10 ml-auto flex shrink-0 items-center gap-0.5 self-center transition-opacity md:absolute md:top-1/2 md:right-4 md:-translate-y-1/2 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="size-7" asChild>
                          <Link href={`/polizas/${p.id}`} aria-label={`Ver póliza de ${p.cliente.nombre}`} title="Ver póliza">
                            <Eye className="size-3.5" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 hover:text-primary" asChild>
                          <Link
                            href={`/captura?renovar=${p.id}`}
                            aria-label={`Renovar póliza de ${p.cliente.nombre}`}
                            title="Capturar la renovación"
                          >
                            <RefreshCcw className="size-3.5" />
                          </Link>
                        </Button>
                        {whatsapp && (
                          <Button variant="ghost" size="icon" className="size-7 hover:text-success" asChild>
                            <a
                              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`WhatsApp a ${p.cliente.nombre}`}
                              title="Contactar por WhatsApp"
                            >
                              <MessageCircle className="size-3.5" />
                            </a>
                          </Button>
                        )}
                        {correo && (
                          <Button variant="ghost" size="icon" className="size-7 hover:text-primary" asChild>
                            <a
                              href={`mailto:${correo}?subject=${encodeURIComponent(`Renovación de su póliza ${p.numeroImpreso}`)}&body=${encodeURIComponent(mensaje)}`}
                              aria-label={`Correo a ${p.cliente.nombre}`}
                              title="Contactar por correo"
                            >
                              <Mail className="size-3.5" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
