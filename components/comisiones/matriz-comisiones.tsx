"use client";

import * as React from "react";
import { AlertCircle, Loader2, Pencil, Percent, Plus, Trash2 } from "lucide-react";

import { AseguradoraTag, RamoBadge } from "@/components/polizas/poliza-ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { eliminarEsquema, guardarEsquema, type EsquemaInput } from "@/lib/comisiones/actions";
import { coberturaDeAnios, MAX_ANIO_POLIZA } from "@/lib/comisiones/reglas";
import type { Ramo } from "@/lib/generated/prisma/client";
import type { Opcion } from "@/lib/polizas/ramos";

export type Esquema = {
  id: string;
  aseguradoraId: string;
  aseguradora: string;
  colorAseguradora: string;
  ramo: Ramo;
  anio: number;
  porcentaje: number;
};

type Formulario = { id?: string; aseguradoraId: string; ramo: string; anio: string; porcentaje: string };
const TODAS = "todas";

export function MatrizComisiones({
  esquemas,
  aseguradoras,
  ramos,
}: {
  esquemas: Esquema[];
  aseguradoras: Opcion[];
  ramos: Opcion[];
}) {
  const [filtro, setFiltro] = React.useState(TODAS);
  const [formulario, setFormulario] = React.useState<Formulario | null>(null);
  const [aEliminar, setAEliminar] = React.useState<Esquema | null>(null);
  const [error, setError] = React.useState<{ mensaje: string; campo?: keyof EsquemaInput } | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  const visibles = esquemas.filter((e) => filtro === TODAS || e.aseguradoraId === filtro);
  // Años definidos por aseguradora + ramo, para explicar qué años cubre cada regla.
  const aniosPorGrupo = React.useMemo(() => {
    const m = new Map<string, number[]>();
    for (const e of esquemas) m.set(`${e.aseguradoraId}|${e.ramo}`, [...(m.get(`${e.aseguradoraId}|${e.ramo}`) ?? []), e.anio]);
    return m;
  }, [esquemas]);

  function abrir(e?: Esquema) {
    setError(null);
    setFormulario(
      e
        ? { id: e.id, aseguradoraId: e.aseguradoraId, ramo: e.ramo, anio: String(e.anio), porcentaje: String(e.porcentaje) }
        : { aseguradoraId: filtro === TODAS ? "" : filtro, ramo: "", anio: "1", porcentaje: "" }
    );
  }

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!formulario) return;
    startTransition(async () => {
      const res = await guardarEsquema({
        id: formulario.id,
        aseguradoraId: formulario.aseguradoraId,
        ramo: formulario.ramo,
        anio: Number(formulario.anio),
        porcentaje: Number(formulario.porcentaje.replace(",", ".")),
      });
      if (res.ok) {
        setFormulario(null);
        setError(null);
      } else {
        setError({ mensaje: res.error, campo: res.campo });
      }
    });
  }

  function eliminar() {
    if (!aEliminar) return;
    startTransition(async () => {
      const res = await eliminarEsquema(aEliminar.id);
      if (res.ok) setAEliminar(null);
      else setError({ mensaje: res.error });
    });
  }

  const actualizar = (cambios: Partial<Formulario>) => {
    setFormulario((f) => (f ? { ...f, ...cambios } : f));
    setError(null);
  };

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="text-base">Reglas de comisión</CardTitle>
        <CardDescription>
          Un año sin regla usa la del mayor año definido que no lo exceda: una sola regla de año 1
          es un porcentaje fijo para todos los años.
        </CardDescription>
        <CardAction className="flex gap-2">
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-48 bg-card" aria-label="Filtrar por aseguradora">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={TODAS}>Todas las aseguradoras</SelectItem>
              {aseguradoras.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => abrir()}>
            <Plus /> Agregar regla
          </Button>
        </CardAction>
      </CardHeader>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
          <div className="flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground">
            <Percent className="size-4" />
          </div>
          <p className="text-sm font-medium">
            {esquemas.length === 0 ? "Aún no hay reglas de comisión" : "Esta aseguradora no tiene reglas"}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Sin reglas, la conciliación marca sus recibos como &quot;Revisar&quot; y no suman a las comisiones
            pendientes del dashboard.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => abrir()}>
            <Plus /> Agregar regla
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Aseguradora</TableHead>
              <TableHead>Ramo</TableHead>
              <TableHead className="text-right">Año de póliza</TableHead>
              <TableHead>Aplica a</TableHead>
              <TableHead className="text-right">Comisión</TableHead>
              <TableHead className="w-24 pr-5">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="pl-5">
                  <AseguradoraTag nombre={e.aseguradora} color={e.colorAseguradora} />
                </TableCell>
                <TableCell>
                  <RamoBadge ramo={e.ramo} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{e.anio}</TableCell>
                <TableCell className="text-muted-foreground">
                  {coberturaDeAnios(aniosPorGrupo.get(`${e.aseguradoraId}|${e.ramo}`) ?? [e.anio], e.anio)}
                </TableCell>
                <TableCell className="text-right font-medium text-primary tabular-nums">{e.porcentaje}%</TableCell>
                <TableCell className="pr-5">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Editar regla" onClick={() => abrir(e)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label="Eliminar regla"
                      onClick={() => {
                        setError(null);
                        setAEliminar(e);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={formulario !== null} onOpenChange={(v) => !v && !pendiente && setFormulario(null)}>
        <DialogContent>
          <form onSubmit={guardar} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{formulario?.id ? "Editar regla" : "Agregar regla"}</DialogTitle>
              <DialogDescription>Porcentaje de comisión sobre el monto de cada recibo.</DialogDescription>
            </DialogHeader>
            {formulario && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="esq-aseguradora">Aseguradora</Label>
                  <Select value={formulario.aseguradoraId} onValueChange={(v) => actualizar({ aseguradoraId: v })}>
                    <SelectTrigger id="esq-aseguradora" className="w-full" aria-invalid={error?.campo === "aseguradoraId"}>
                      <SelectValue placeholder="Selecciona la aseguradora" />
                    </SelectTrigger>
                    <SelectContent>
                      {aseguradoras.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="esq-ramo">Ramo</Label>
                  <Select value={formulario.ramo} onValueChange={(v) => actualizar({ ramo: v })}>
                    <SelectTrigger id="esq-ramo" className="w-full" aria-invalid={error?.campo === "ramo"}>
                      <SelectValue placeholder="Selecciona el ramo" />
                    </SelectTrigger>
                    <SelectContent>
                      {ramos.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="esq-anio">Año de póliza</Label>
                  <Input
                    id="esq-anio"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_ANIO_POLIZA}
                    step={1}
                    value={formulario.anio}
                    onChange={(e) => actualizar({ anio: e.target.value })}
                    aria-invalid={error?.campo === "anio"}
                    className="tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">1 = negocio nuevo, 2 = primera renovación…</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="esq-porcentaje">Comisión</Label>
                  <div className="relative">
                    <Input
                      id="esq-porcentaje"
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      max={100}
                      step={0.01}
                      placeholder="Ej. 12"
                      value={formulario.porcentaje}
                      onChange={(e) => actualizar({ porcentaje: e.target.value })}
                      aria-invalid={error?.campo === "porcentaje"}
                      className="pr-8 tabular-nums"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" /> {error.mensaje}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pendiente}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Loader2 className="animate-spin" />}
                {formulario?.id ? "Guardar cambios" : "Agregar regla"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={aEliminar !== null} onOpenChange={(v) => !v && !pendiente && setAEliminar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar la regla?</DialogTitle>
            <DialogDescription>
              {aEliminar &&
                `${aEliminar.aseguradora} · año ${aEliminar.anio} · ${aEliminar.porcentaje}%. Los recibos de ese ramo y año pasarán a usar la regla del año anterior definido, o quedarán sin comisión esperada si no hay ninguna.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" /> {error.mensaje}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pendiente}>
                Cancelar
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={eliminar} disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
