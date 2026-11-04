"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
import type { AnioCrecimiento } from "@/lib/reportes/crecimiento";
import { cn } from "@/lib/utils";

const compacto = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});
/** Etiqueta sobre la columna: corta para que no choque con la de al lado ("$700 k", "$1.8 M"). */
const etiqueta = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumSignificantDigits: 2,
});
/** Con más años que esto las etiquetas ya no caben: quedan el eje, el tooltip y la tabla. */
const MAX_ETIQUETAS = 10;

const polizasTexto = (n: number) => `${formatNumero(n)} ${n === 1 ? "póliza" : "pólizas"}`;

/** "+12%" / "−8%" con flecha: el sentido no se comunica solo con el color. */
export function Crecimiento({ valor, className }: { valor: number | null; className?: string }) {
  if (valor === null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const redondeado = Math.round(valor);
  const Icono = redondeado > 0 ? ArrowUpRight : redondeado < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        redondeado > 0 ? "text-success" : redondeado < 0 ? "text-destructive" : "text-muted-foreground",
        className
      )}
    >
      <Icono className="size-3.5" aria-hidden />
      {redondeado > 0 ? "+" : redondeado < 0 ? "−" : ""}
      {formatPorcentaje(Math.abs(valor), 0)}
    </span>
  );
}

/** Enlace al reporte con las pólizas de `anio` abiertas (conserva el periodo elegido). */
export function hrefAnioReporte(anio: number, periodo?: string) {
  const params = new URLSearchParams();
  if (periodo) params.set("periodo", periodo);
  params.set("anio", String(anio));
  return `/reportes?${params.toString()}#polizas-anio`;
}

/**
 * Prima emitida por año en columnas de una sola serie (el acento corporativo). El año en curso va
 * más tenue porque solo cuenta hasta hoy. Las pólizas y el crecimiento van en el tooltip y en la
 * tabla de abajo: una sola escala en el eje. Al picar un año (columna o renglón) se abren sus pólizas.
 */
export function CrecimientoChart({
  datos,
  anioSeleccionado,
  periodo,
}: {
  datos: AnioCrecimiento[];
  /** Año cuyas pólizas se están mostrando: su columna queda resaltada. */
  anioSeleccionado?: number;
  /** Periodo del reporte distinto al predeterminado, para conservarlo al elegir un año. */
  periodo?: string;
}) {
  const reducir = useReducedMotion();
  const router = useRouter();
  const abrirAnio = (anio: number) => router.push(hrefAnioReporte(anio, periodo));

  return (
    <div className="space-y-4">
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 24, right: 8, bottom: 0, left: 8 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis
              dataKey="anio"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(anio: number) => (datos.find((d) => d.anio === anio)?.enCurso ? `${anio}*` : String(anio))}
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => compacto.format(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.5 }}
              content={<TooltipCrecimiento />}
              isAnimationActive={false}
            />
            <Bar
              dataKey="prima"
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
              isAnimationActive={!reducir}
              animationBegin={250}
              animationDuration={800}
              animationEasing="ease-out"
              cursor="pointer"
              onClick={(_, i) => {
                const d = datos[i];
                if (d) abrirAnio(d.anio);
              }}
            >
              {datos.map((d) => (
                <Cell
                  key={d.anio}
                  fill="var(--primary)"
                  // Con un año elegido, los demás se atenúan.
                  fillOpacity={(d.enCurso ? 0.5 : 1) * (anioSeleccionado && anioSeleccionado !== d.anio ? 0.35 : 1)}
                />
              ))}
              {datos.length <= MAX_ETIQUETAS && (
                <LabelList
                  dataKey="prima"
                  position="top"
                  formatter={(v) => (Number(v) > 0 ? etiqueta.format(Number(v)) : "")}
                  style={{ fill: "var(--foreground)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">Crecimiento por año</caption>
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-medium">Año</th>
              <th className="py-1.5 text-right font-medium">Pólizas</th>
              <th className="py-1.5 text-right font-medium">Prima emitida</th>
              <th className="py-1.5 text-right font-medium">Crecimiento</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...datos].reverse().map((d) => (
              <tr
                key={d.anio}
                className={cn("border-b last:border-0", d.anio === anioSeleccionado && "bg-primary/5 font-medium")}
              >
                <td className="py-1.5">
                  <Link
                    href={hrefAnioReporte(d.anio, periodo)}
                    title={`Ver las pólizas de ${d.anio}`}
                    aria-current={d.anio === anioSeleccionado ? "true" : undefined}
                    className="rounded-sm text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {d.anio}
                  </Link>
                  {d.enCurso && <span className="ml-1.5 text-muted-foreground">a la fecha*</span>}
                </td>
                <td className="py-1.5 text-right">{formatNumero(d.polizas)}</td>
                <td className="py-1.5 text-right">{formatMoneda(d.prima)}</td>
                <td className="py-1.5 text-right">
                  <Crecimiento valor={d.crecimiento} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TooltipCrecimiento({ active, payload }: { active?: boolean; payload?: { payload: AnioCrecimiento }[] }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">
        {d.anio}
        {d.enCurso && <span className="font-normal text-muted-foreground"> · a la fecha</span>}
      </p>
      <p className="tabular-nums">{formatMoneda(d.prima)}</p>
      <p className="text-muted-foreground tabular-nums">{polizasTexto(d.polizas)}</p>
      {d.crecimiento !== null && (
        <p className="mt-1 flex items-center gap-1">
          <Crecimiento valor={d.crecimiento} />
          <span className="text-muted-foreground">
            {d.enCurso ? "vs. el mismo periodo del año pasado" : `vs. ${d.anio - 1}`}
          </span>
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Clic para ver sus pólizas</p>
    </div>
  );
}
