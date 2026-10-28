import Link from "next/link";
import { FileText, Paperclip, UserRound } from "lucide-react";

import { AvatarIniciales } from "@/components/layout/avatar-iniciales";
import { BarraProporcion } from "@/components/layout/barra-proporcion";
import { COLOR_TONO, IconoRelieve } from "@/components/layout/icono-relieve";
import { Inclinable } from "@/components/layout/inclinable";
import {
  EstadoVigenciaIndicador,
  esCobrado,
  estadoVigencia,
  FaltaContacto,
  formaPagoLabel,
  RamoBadge,
} from "@/components/polizas/poliza-ui";
import { Card } from "@/components/ui/card";
import { monograma } from "@/lib/aseguradoras/monograma";
import { normalizarHex } from "@/lib/color";
import { formatFecha, formatMoneda } from "@/lib/format";
import { DIAS_POR_VENCER, type getPolizasListado } from "@/lib/polizas/queries";
import { cn } from "@/lib/utils";

type PolizaListado = Awaited<ReturnType<typeof getPolizasListado>>["polizas"][number];

/** Color de la barra de vigencia según el estado de la póliza. */
const COLOR_ESTADO = {
  vigente: COLOR_TONO.success,
  por_vencer: COLOR_TONO.warning,
  vencida: COLOR_TONO.destructive,
  cancelada: COLOR_TONO.muted,
} as const;

/**
 * Una póliza como tarjeta, con el estilo de Aseguradoras en el color de su compañía: monograma,
 * número, cliente, prima, recibos pagados y cuánto lleva de su vigencia. Toda la tarjeta abre el
 * expediente; una cancelada se ve apagada.
 */
export function TarjetaPolizaListado({
  p,
  hoy,
  orden,
  verEjecutivo,
}: {
  p: PolizaListado;
  hoy: string;
  orden: number;
  verEjecutivo: boolean;
}) {
  const color = normalizarHex(p.aseguradora.color_hex) ?? "#71717a";
  const estado = estadoVigencia(p.vigencia_fin, hoy, DIAS_POR_VENCER, p.canceladaAt);
  const cobrados = p.recibos.filter((r) => esCobrado(r.estado)).length;
  const cobrables = p.recibos.filter((r) => r.estado !== "CANCELADO").length;
  const duracion = p.vigencia_fin.getTime() - p.vigencia_inicio.getTime();
  const transcurrido = Date.parse(`${hoy}T00:00:00Z`) - p.vigencia_inicio.getTime();
  const avance = duracion > 0 ? transcurrido / duracion : 0;
  const retraso = Math.min(orden, 12) * 45;

  return (
    <div className="h-full animate-entrar" style={{ animationDelay: `${retraso}ms` }}>
      <Inclinable className="group/tarjeta h-full rounded-xl" grados={4}>
        <Card
          acento={color}
          className={cn(
            "h-full gap-4 px-5 py-5 transition-[border-color,box-shadow,opacity] duration-200 group-hover/tarjeta:shadow-lg",
            estado === "cancelada" && "opacity-70 grayscale-[0.6] group-hover/tarjeta:opacity-100"
          )}
        >
          <Link
            href={`/polizas/${p.id}`}
            aria-label={`Ver póliza ${p.numeroImpreso} de ${p.cliente.nombre}`}
            className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex items-start gap-3">
            <IconoRelieve color={color} texto={monograma(p.aseguradora.nombre)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold" title={p.aseguradora.nombre}>
                {p.aseguradora.nombre}
              </p>
              <div className="mt-0.5">
                <RamoBadge ramo={p.ramo} />
              </div>
            </div>
            <EstadoVigenciaIndicador fin={p.vigencia_fin} hoy={hoy} diasAviso={DIAS_POR_VENCER} cancelada={p.canceladaAt} />
          </div>

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-lg font-semibold tracking-tight">
              <span className="truncate" title={p.numeroImpreso}>
                {p.numeroImpreso}
              </span>
              {(p.caratula_path || p.negociacion_path) && (
                <FileText className="size-3.5 shrink-0 text-primary" aria-label="Con documentos PDF" />
              )}
              {p.expediente_path && <Paperclip className="size-3.5 shrink-0 text-primary" aria-label="Con expediente ZIP" />}
            </p>
            {p.polizaVigor && <p className="truncate font-mono text-[11px] text-muted-foreground">vigor: {p.polizaVigor}</p>}
          </div>

          <div className="flex items-center gap-2.5">
            <AvatarIniciales nombre={p.cliente.nombre} className="size-8 text-[10px]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={p.cliente.nombre}>
                {p.cliente.nombre}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{p.cliente.rfc}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 border-t pt-4">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Prima total</dt>
              <dd className="truncate text-base font-semibold tabular-nums">{formatMoneda(Number(p.prima_total))}</dd>
              <dd className="text-[11px] text-muted-foreground">{formaPagoLabel[p.forma_pago]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Recibos pagados</dt>
              <dd className="text-base font-semibold tabular-nums">
                {cobrados}
                <span className="text-sm font-normal text-muted-foreground">/{cobrables}</span>
              </dd>
            </div>
          </dl>

          <BarraProporcion
            etiqueta="Vigencia"
            valor={`${formatFecha(p.vigencia_inicio)} – ${formatFecha(p.vigencia_fin)}`}
            fraccion={estado === "cancelada" ? 0 : avance}
            color={COLOR_ESTADO[estado]}
            retraso={400 + retraso}
          />

          {(verEjecutivo || !p.cliente.telefono || !p.cliente.email) && (
            <div className="mt-auto flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {verEjecutivo && (
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <UserRound className="size-3 shrink-0" />
                  {p.ejecutivo?.nombre ?? "Sin asignar"}
                </span>
              )}
              <span className="ml-auto">
                <FaltaContacto telefono={p.cliente.telefono} email={p.cliente.email} ramo={p.ramo} />
              </span>
            </div>
          )}
        </Card>
      </Inclinable>
    </div>
  );
}
