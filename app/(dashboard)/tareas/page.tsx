import type { Metadata } from "next";
import Link from "next/link";
import { ListTodo } from "lucide-react";

import { ListaTareas } from "@/components/tareas/lista-tareas";
import { NuevaTarea } from "@/components/tareas/nueva-tarea";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { formatNumero, hoyISO } from "@/lib/format";
import { esVistaTareas, getTareas, LIMITE_TAREAS, type VistaTareas } from "@/lib/tareas/queries";
import { GRUPOS_TAREA, grupoTarea } from "@/lib/tareas/reglas";
import { getEjecutivos } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tareas",
};

const VISTAS: { clave: VistaTareas; label: string }[] = [
  { clave: "mias", label: "Mis pendientes" },
  { clave: "todas", label: "Pendientes del equipo" },
  { clave: "completadas", label: "Completadas" },
];

export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  const params = await searchParams;
  const user = await requireUser();
  // Un ejecutivo que solo ve su cartera no tiene la vista del equipo.
  const vistas = user.soloSuCartera ? VISTAS.filter((v) => v.clave !== "todas") : VISTAS;
  const vista: VistaTareas =
    esVistaTareas(params.vista) && vistas.some((v) => v.clave === params.vista) ? params.vista : "mias";
  const hoy = hoyISO();
  const [{ tareas, total }, ejecutivos] = await Promise.all([
    getTareas(vista),
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
  ]);

  const grupos = GRUPOS_TAREA.map((g) => ({
    ...g,
    tareas: tareas.filter(
      (t) => grupoTarea({ vence: t.vence.toISOString().slice(0, 10), completada: t.completadaAt !== null }, hoy) === g.clave
    ),
  })).filter((g) => g.tareas.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
          <p className="text-sm text-muted-foreground">
            Pendientes y recordatorios del equipo; los de un cliente o una póliza también aparecen en su expediente.
          </p>
        </div>
        <NuevaTarea hoy={hoy} ejecutivos={ejecutivos} usuarioId={user.id} variante="default" />
      </div>

      <nav aria-label="Vistas de tareas" className="flex flex-wrap gap-2">
        {vistas.map((v) => (
          <Button
            key={v.clave}
            asChild
            size="sm"
            variant={vista === v.clave ? "default" : "outline"}
            className="h-8"
          >
            <Link href={v.clave === "mias" ? "/tareas" : `/tareas?vista=${v.clave}`} aria-current={vista === v.clave ? "page" : undefined}>
              {v.label}
            </Link>
          </Button>
        ))}
      </nav>

      {tareas.length === 0 ? (
        <Card className="items-center gap-2 border-dashed py-14 text-center">
          <ListTodo className="size-7 text-primary" />
          <p className="font-medium">
            {vista === "completadas" ? "Aún no hay tareas completadas" : "Sin pendientes"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crea una tarea para no olvidar una llamada, un pago o una renovación.
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
                    {g.tareas.length}
                  </span>
                </CardTitle>
                {g.clave === "vencida" && (
                  <CardDescription>Su fecha ya pasó: complétalas o pospónlas con el ícono de calendario.</CardDescription>
                )}
              </CardHeader>
              <ListaTareas tareas={g.tareas} hoy={hoy} mostrarResponsable={vista !== "mias"} />
            </Card>
          ))}
          {total > tareas.length && (
            <p className="text-xs text-muted-foreground">
              Mostrando {formatNumero(tareas.length)} de {formatNumero(total)} (límite {LIMITE_TAREAS}).
            </p>
          )}
        </div>
      )}
    </>
  );
}
