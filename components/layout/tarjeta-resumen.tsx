import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { ValorAjustado } from "@/components/dashboard/valor-ajustado";
import { COLOR_TONO, IconoRelieve, type Tono } from "@/components/layout/icono-relieve";
import { Inclinable } from "@/components/layout/inclinable";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TonoResumen = Tono;

/**
 * Indicador de un módulo (pólizas registradas, monto por cobrar…) con el estilo de las tarjetas
 * de Aseguradoras: línea y halo de su tono, ícono con relieve, entrada escalonada según `orden`,
 * número que cuenta desde cero e inclinación 3D hacia el cursor. Si lleva a otra pantalla (`href`)
 * o abre algo (`onClick`, desde un componente cliente: un resumen en un diálogo), aparece una flecha.
 */
export function TarjetaResumen({
  titulo,
  valor,
  icono,
  detalle,
  href,
  onClick,
  tono = "primary",
  orden = 0,
}: {
  titulo: string;
  /** Valor ya formateado ("$58,930.57", "56"). */
  valor: string;
  icono: LucideIcon;
  detalle?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  tono?: TonoResumen;
  /** Posición en su fila, para escalonar la entrada. */
  orden?: number;
}) {
  const color = COLOR_TONO[tono];
  const interactiva = Boolean(href || onClick);
  const claseEnvoltura = "block h-full w-full rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
  const contenido = (
    <Card
      acento={color}
      className={cn(
        "@container h-full flex-row items-center gap-4 px-5 py-4 transition-[border-color,box-shadow] duration-200 ease-out",
        interactiva && "group-hover/tarjeta:border-primary/40 group-hover/tarjeta:shadow-lg group-hover/tarjeta:shadow-primary/10"
      )}
    >
      <IconoRelieve
        color={color}
        icono={icono}
        // Con un monto largo en una tarjeta angosta, el ícono cede su lugar.
        className={cn(valor.length > 12 && "@max-[15rem]:hidden")}
      />
      <div className="@container min-w-0 flex-1">
        <ValorAjustado valor={valor} animado />
        <p className="truncate text-xs text-muted-foreground">{titulo}</p>
        {detalle && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{detalle}</div>}
      </div>
      {interactiva && (
        <ArrowUpRight
          aria-hidden
          className="size-4 shrink-0 self-start text-primary opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/tarjeta:translate-x-0.5 group-hover/tarjeta:-translate-y-0.5 group-hover/tarjeta:opacity-100 group-has-[:focus-visible]/tarjeta:opacity-100"
        />
      )}
    </Card>
  );

  return (
    // La entrada (CSS) y la inclinación (resorte) van en elementos distintos: no se pisan el transform.
    <div className="h-full animate-entrar" style={{ animationDelay: `${orden * 60}ms` }}>
      <Inclinable className="group/tarjeta h-full rounded-xl" grados={4}>
        {href ? (
          <Link href={href} className={claseEnvoltura}>
            {contenido}
          </Link>
        ) : onClick ? (
          <button type="button" onClick={onClick} aria-haspopup="dialog" className={cn(claseEnvoltura, "cursor-pointer")}>
            {contenido}
          </button>
        ) : (
          contenido
        )}
      </Inclinable>
    </div>
  );
}
