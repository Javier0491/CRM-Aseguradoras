"use client";

import * as React from "react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoneda, formatNumero } from "@/lib/format";

export type ProduccionAseguradora = { aseguradora: string; prima: number; polizas: number };

const compacto = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

const ALTO_BARRA = 20; // ≤ 24 px: la barra no llena la banda
const ALTO_FILA = 36;

/**
 * Producción (prima emitida) por aseguradora: barras horizontales de una sola serie,
 * ordenadas de mayor a menor. La identidad va en el eje (nombre), no en el color, así que
 * todas las barras usan el acento corporativo.
 */
export function ProduccionChart({ datos }: { datos: ProduccionAseguradora[] }) {
  const total = datos.reduce((s, d) => s + d.prima, 0);
  const filas = datos.map((d) => ({ ...d, porcentaje: total > 0 ? (d.prima / total) * 100 : 0 }));
  const anchoEtiquetas = Math.min(
    160,
    Math.max(72, ...filas.map((d) => d.aseguradora.length * 7.5))
  );

  return (
    <div className="space-y-3">
      <div style={{ height: filas.length * ALTO_FILA + 8 }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={filas}
            layout="vertical"
            margin={{ top: 4, right: 72, bottom: 4, left: 0 }}
            barCategoryGap={ALTO_FILA - ALTO_BARRA}
          >
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="aseguradora"
              width={anchoEtiquetas}
              tickLine={false}
              axisLine={false}
              tick={(props: EtiquetaEjeProps) => <EtiquetaEje {...props} ancho={anchoEtiquetas - 8} />}
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.5 }}
              content={<TooltipProduccion />}
              isAnimationActive={false}
            />
            <Bar
              dataKey="prima"
              fill="var(--primary)"
              barSize={ALTO_BARRA}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="prima"
                position="right"
                formatter={(v) => compacto.format(Number(v))}
                style={{ fill: "var(--foreground)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Vista de tabla: accesible y para leer los montos exactos. */}
      <details className="group text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Ver como tabla
        </summary>
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">Producción por aseguradora</caption>
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-medium">Aseguradora</th>
              <th className="py-1.5 text-right font-medium">Pólizas</th>
              <th className="py-1.5 text-right font-medium">Prima emitida</th>
              <th className="py-1.5 text-right font-medium">% del total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {filas.map((d) => (
              <tr key={d.aseguradora} className="border-b last:border-0">
                <td className="py-1.5">{d.aseguradora}</td>
                <td className="py-1.5 text-right">{formatNumero(d.polizas)}</td>
                <td className="py-1.5 text-right">{formatMoneda(d.prima)}</td>
                <td className="py-1.5 text-right">{d.porcentaje.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

type EtiquetaEjeProps = { x?: number | string; y?: number | string; payload?: { value?: unknown } };

/**
 * Nombre en el eje: en un solo renglón, recortado con "…" si no cabe. En varios renglones, los
 * nombres largos ("Qualitas Compañía de Seguros, S.A. de C.V.") se encimaban con la barra de al
 * lado; el nombre completo queda en el tooltip, en la vista de tabla y en el <title> de la etiqueta.
 */
function EtiquetaEje({ x, y, payload, ancho }: EtiquetaEjeProps & { ancho: number }) {
  const nombre = String(payload?.value ?? "");
  const caben = Math.max(4, Math.floor(ancho / 6.5));
  const texto = nombre.length > caben ? `${nombre.slice(0, caben - 1).trimEnd()}…` : nombre;
  return (
    <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fill="var(--muted-foreground)" fontSize={12}>
      <title>{nombre}</title>
      {texto}
    </text>
  );
}

function TooltipProduccion({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ProduccionAseguradora & { porcentaje: number } }[];
}) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{d.aseguradora}</p>
      <p className="tabular-nums">{formatMoneda(d.prima)}</p>
      <p className="text-muted-foreground tabular-nums">
        {d.porcentaje.toFixed(1)}% del total · {formatNumero(d.polizas)}{" "}
        {d.polizas === 1 ? "póliza" : "pólizas"}
      </p>
    </div>
  );
}
