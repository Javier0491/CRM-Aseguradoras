import Link from "next/link";
import { AlarmClock, CalendarCheck, CheckCircle2, Coffee, ListTodo, PartyPopper, Users } from "lucide-react";

import { ListaTareas, type TareaVista } from "@/components/tareas/lista-tareas";
import { ActivarNotificaciones } from "@/components/notificaciones/activar-notificaciones";
import { NuevaTarea } from "@/components/tareas/nueva-tarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumero, iniciales } from "@/lib/format";
import type { AvancePersona, MiResumenTareas, VistaTareas } from "@/lib/tareas/queries";
import { GRUPOS_TAREA, grupoTarea } from "@/lib/tareas/reglas";
import type { OpcionEquipo } from "@/lib/usuarios/queries";
import { rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";
import { cn } from "@/lib/utils";

/** `corta`: la etiqueta en el celular, para que las tres vistas quepan en una línea. */
const VISTAS: { clave: VistaTareas; label: string; corta: string }[] = [
  { clave: "mias", label: "Mis pendientes", corta: "Mías" },
  { clave: "todas", label: "Del equipo", corta: "Equipo" },
  { clave: "completadas", label: "Completadas", corta: "Hechas" },
];

const fechaLarga = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Mexico_City",
});

export type DatosTareas = {
  usuario: { id: string; email: string | null; nombre: string | null; soloTareas: boolean; coordinaTareas: boolean };
  vista: VistaTareas;
  /** Con la vista "Del equipo" (quien coordina y quien opera toda la cartera). */
  conEquipo: boolean;
  tareas: TareaVista[];
  total: number;
  limite: number;
  resumen: MiResumenTareas;
  /** Para elegir encargados al crear; no viene para quien solo ve su cartera. */
  equipo?: OpcionEquipo[];
  /** Avance de cada persona: solo para quien coordina. */
  avance: AvancePersona[] | null;
  hoy: string;
};

/**
 * Página de Tareas. Para la Ejecutiva de operación, el Líder de oficina y el Auxiliar es toda su
 * herramienta: la saluda, le muestra cómo va su día y sus pendientes agrupados por urgencia.
 */
export function VistaTareasPagina({ usuario, vista, conEquipo, tareas, total, limite, resumen, equipo, avance, hoy }: DatosTareas) {
  const vistas = conEquipo ? VISTAS : VISTAS.filter((v) => v.clave !== "todas");
  const grupos = GRUPOS_TAREA.map((g) => ({
    ...g,
    tareas: tareas.filter(
      (t) => grupoTarea({ vence: t.vence.toISOString().slice(0, 10), completada: t.completadaAt !== null }, hoy) === g.clave
    ),
  })).filter((g) => g.tareas.length > 0);
  const nombre = usuario.nombre?.trim().split(/\s+/)[0];

  const tarjetas = [
    { label: "Mis pendientes", valor: resumen.pendientes, icono: ListTodo, clase: "text-primary" },
    { label: "Para hoy", valor: resumen.deHoy, icono: CalendarCheck, clase: resumen.deHoy > 0 ? "text-warning" : "text-muted-foreground" },
    {
      label: "Vencidas",
      valor: resumen.vencidas,
      icono: AlarmClock,
      clase: resumen.vencidas > 0 ? "text-destructive" : "text-muted-foreground",
    },
    { label: "Hechas en 7 días", valor: resumen.hechas, icono: CheckCircle2, clase: "text-success" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight wrap-anywhere">
            {usuario.soloTareas && nombre ? `Hola, ${nombre}` : "Tareas"}
          </h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {usuario.soloTareas
              ? `${fechaLarga.format(new Date())} · tus pendientes y los del equipo que te tocan.`
              : "Pendientes y recordatorios del equipo; los de un cliente o una póliza también aparecen en su expediente."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActivarNotificaciones />
          <NuevaTarea hoy={hoy} equipo={equipo} usuarioId={usuario.id} variante="default" />
        </div>
      </div>

      <section aria-label="Mi resumen" className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <TuDia resumen={resumen} />
        <div className="grid grid-cols-2 gap-3">
          {tarjetas.map((t) => (
            <Card key={t.label} className="flex-row items-center gap-3 px-4 py-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background", t.clase)}>
                <t.icono className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl leading-tight font-semibold tabular-nums">{formatNumero(t.valor)}</span>
                <span className="block text-xs leading-tight text-muted-foreground">{t.label}</span>
              </span>
            </Card>
          ))}
        </div>
      </section>

      <div className={cn("grid grid-cols-1 items-start gap-6", avance && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
        <div className="min-w-0 space-y-4">
          <nav aria-label="Vistas de tareas" className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg border bg-muted/50 p-0.5">
            {vistas.map((v) => {
              const activa = vista === v.clave;
              return (
                <Link
                  key={v.clave}
                  href={v.clave === "mias" ? "/tareas" : `/tareas?vista=${v.clave}`}
                  aria-current={activa ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-[background-color,color] duration-150",
                    activa ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="sm:hidden">{v.corta}</span>
                  <span className="hidden sm:inline">{v.label}</span>
                  {v.clave === "mias" && resumen.pendientes > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px] leading-4 tabular-nums",
                        activa ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {formatNumero(resumen.pendientes)}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {tareas.length === 0 ? (
            <Card className="items-center gap-2 border-dashed py-14 text-center">
              {vista === "mias" ? <PartyPopper className="size-7 text-primary" /> : <ListTodo className="size-7 text-primary" />}
              <p className="font-medium">
                {vista === "completadas"
                  ? "Aún no hay tareas completadas"
                  : vista === "mias"
                    ? "¡Todo al día!"
                    : "El equipo no tiene pendientes"}
              </p>
              <p className="max-w-sm px-4 text-sm text-muted-foreground">
                {vista === "mias"
                  ? "No tienes pendientes. Cuando alguien te encargue una tarea aparecerá aquí."
                  : "Crea una tarea para no olvidar una llamada, un pago o una renovación."}
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {grupos.map((g) => (
                <Card key={g.clave} className="gap-0 py-0">
                  <CardHeader className="border-b px-5 py-3 [.border-b]:pb-3">
                    <CardTitle
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        g.clave === "vencida" && "text-destructive",
                        g.clave === "hoy" && "text-warning"
                      )}
                    >
                      {g.titulo}
                      <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground tabular-nums">
                        {formatNumero(g.tareas.length)}
                      </span>
                    </CardTitle>
                    {g.clave === "vencida" && (
                      <CardDescription>Su fecha ya pasó: complétalas o pospónlas con el ícono de calendario.</CardDescription>
                    )}
                  </CardHeader>
                  <ListaTareas
                    tareas={g.tareas}
                    hoy={hoy}
                    usuarioId={usuario.id}
                    usuarioEmail={usuario.email}
                    coordina={usuario.coordinaTareas}
                    enlaces={!usuario.soloTareas}
                    mostrarResponsable={vista !== "mias"}
                  />
                </Card>
              ))}
              {total > tareas.length && (
                <p className="text-xs text-muted-foreground">
                  Mostrando {formatNumero(tareas.length)} de {formatNumero(total)} (límite {formatNumero(limite)}).
                </p>
              )}
            </div>
          )}
        </div>

        {avance && <AvanceEquipo personas={avance} usuarioId={usuario.id} />}
      </div>
    </>
  );
}

/**
 * Cómo va mi día: de lo que vence hoy o ya venció más lo que terminé hoy, cuánto llevo. Un anillo
 * y una frase que dice qué sigue.
 */
function TuDia({ resumen }: { resumen: MiResumenTareas }) {
  const porHacer = resumen.deHoy + resumen.vencidas;
  const total = resumen.hechasHoy + porHacer;
  const porcentaje = total === 0 ? 0 : Math.round((resumen.hechasHoy / total) * 100);
  const completo = total > 0 && porHacer === 0;
  const faltan = porHacer === 1 ? "Te falta 1" : `Te faltan ${formatNumero(porHacer)}`;
  const mensaje =
    total === 0
      ? "Nada vence hoy. Buen momento para adelantar lo de la semana."
      : completo
        ? "¡Día completo! Terminaste todo lo de hoy."
        : resumen.vencidas > 0
          ? `${faltan}; empieza por ${resumen.vencidas === 1 ? "la vencida" : `las ${formatNumero(resumen.vencidas)} vencidas`}.`
          : `${faltan} para cerrar el día.`;

  return (
    <Card className="flex-row items-center gap-4 px-5 py-4">
      <AnilloDia porcentaje={porcentaje} completo={completo} libre={total === 0} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Tu día</p>
        <p className="text-lg leading-tight font-semibold tabular-nums">
          {total === 0 ? "Sin pendientes para hoy" : `${formatNumero(resumen.hechasHoy)} de ${formatNumero(total)} hechas`}
        </p>
        <p className="text-sm text-muted-foreground">{mensaje}</p>
      </div>
    </Card>
  );
}

/** Anillo del avance del día; al cambiar, el trazo avanza (300 ms) en vez de saltar. */
function AnilloDia({ porcentaje, completo, libre }: { porcentaje: number; completo: boolean; libre: boolean }) {
  const r = 24;
  const largo = 2 * Math.PI * r;
  return (
    <span
      className="relative flex size-16 shrink-0 items-center justify-center"
      role="img"
      aria-label={libre ? "Sin pendientes para hoy" : `Avance del día: ${porcentaje}%`}
    >
      <svg viewBox="0 0 56 56" className="absolute inset-0 size-16 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={largo}
          strokeDashoffset={largo * (1 - porcentaje / 100)}
          className={cn(
            "transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none",
            completo ? "stroke-success" : "stroke-primary",
            porcentaje === 0 && "opacity-0"
          )}
        />
      </svg>
      {libre ? (
        <Coffee className="size-5 text-muted-foreground" aria-hidden />
      ) : completo ? (
        <CheckCircle2 className="size-6 text-success" aria-hidden />
      ) : (
        <span className="text-sm font-semibold tabular-nums" aria-hidden>
          {porcentaje}%
        </span>
      )}
    </span>
  );
}

/** Avance de cada persona del equipo (para el Administrador y el Líder de oficina). */
function AvanceEquipo({ personas, usuarioId }: { personas: AvancePersona[]; usuarioId: string }) {
  const conTareas = personas.filter((p) => p.pendientes + p.hechas > 0);
  const hechas = conTareas.reduce((s, p) => s + p.hechas, 0);
  const pendientes = conTareas.reduce((s, p) => s + p.pendientes, 0);
  const general = hechas + pendientes === 0 ? 0 : Math.round((hechas / (hechas + pendientes)) * 100);
  return (
    // Fijo al hacer scroll en pantallas anchas; con un equipo grande la lista se recorre por dentro.
    <Card className="gap-0 py-0 xl:sticky xl:top-20 xl:max-h-[calc(100svh-6rem)]">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-primary" /> Avance del equipo
          {conTareas.length > 0 && <span className="ml-auto text-sm font-semibold tabular-nums">{general}%</span>}
        </CardTitle>
        <CardDescription>Partes terminadas en los últimos 30 días y lo que le queda a cada quien.</CardDescription>
      </CardHeader>
      {conTareas.length === 0 ? (
        <CardContent className="py-6 text-center text-sm text-muted-foreground">Nadie tiene tareas encargadas todavía.</CardContent>
      ) : (
        <ul className="min-h-0 divide-y overflow-y-auto">
          {conTareas.map((p) => {
            const porcentaje = Math.round((p.hechas / (p.hechas + p.pendientes)) * 100);
            return (
              <li key={p.id} className="flex items-start gap-3 px-5 py-3">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    porcentaje === 100 ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
                  )}
                >
                  {iniciales(p.nombre)}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium" title={p.nombre}>
                      {p.nombre}
                      {p.id === usuarioId && <span className="font-normal text-muted-foreground"> (yo)</span>}
                    </p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{porcentaje}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`Avance de ${p.nombre}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={porcentaje}
                  >
                    <div
                      className={cn("h-full rounded-full", porcentaje === 100 ? "bg-success" : "bg-primary")}
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                  <p className="flex flex-wrap gap-x-1.5 text-[11px] text-muted-foreground">
                    <span>{rolLabels[p.rol as RolUsuario] ?? p.rol}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {formatNumero(p.pendientes)} {p.pendientes === 1 ? "pendiente" : "pendientes"}
                    </span>
                    {p.vencidas > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-medium text-destructive tabular-nums">
                          {formatNumero(p.vencidas)} {p.vencidas === 1 ? "vencida" : "vencidas"}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
