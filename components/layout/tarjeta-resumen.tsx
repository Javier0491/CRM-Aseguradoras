import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { ValorAjustado } from "@/components/dashboard/valor-ajustado";
import { Inclinable } from "@/components/layout/inclinable";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TonoResumen = "primary" | "warning" | "destructive" | "success" | "muted";

const TONOS: Record<TonoResumen, string> = {
  primary: "border-primary/25 bg-primary/10 text-primary",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  success: "border-success/30 bg-success/10 text-success",
  muted: "bg-background text-muted-foreground",
};

/**
 * Indicador de un módulo (pólizas registradas, monto por cobrar…): entra escalonado según `orden`,
 * su número cuenta desde cero, se inclina en 3D hacia el cursor y, si lleva a otra pantalla, su
 * ícono reacciona y aparece una flecha.
 */
export function TarjetaResumen({
  titulo,
  valor,
  icono: Icono,
  detalle,
  href,
  tono = "primary",
  orden = 0,
}: {
  titulo: string;
  /** Valor ya formateado ("$58,930.57", "56"). */
  valor: string;
  icono: LucideIcon;
  detalle?: React.ReactNode;
  href?: string;
  tono?: TonoResumen;
  /** Posición en su fila, para escalonar la entrada. */
  orden?: number;
}) {
  const contenido = (
    <Card
      className={cn(
        "@container h-full flex-row items-center gap-4 px-5 py-4 transition-[border-color,box-shadow] duration-200 ease-out",
        href && "group-hover/resumen:border-primary/40 group-hover/resumen:shadow-lg group-hover/resumen:shadow-primary/10"
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl border transition-[scale,rotate] duration-200 ease-out",
          "group-hover/resumen:scale-110 group-hover/resumen:-rotate-6 motion-reduce:group-hover/resumen:scale-100 motion-reduce:group-hover/resumen:rotate-0",
          // Con un monto largo en una tarjeta angosta, el ícono cede su lugar.
          valor.length > 12 && "@max-[15rem]:hidden",
          TONOS[tono]
        )}
      >
        <Icono className="size-[18px]" />
      </span>
      <div className="@container min-w-0 flex-1">
        <ValorAjustado valor={valor} animado />
        <p className="truncate text-xs text-muted-foreground">{titulo}</p>
        {detalle && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{detalle}</div>}
      </div>
      {href && (
        <ArrowUpRight
          aria-hidden
          className="size-4 shrink-0 self-start text-primary opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/resumen:translate-x-0.5 group-hover/resumen:-translate-y-0.5 group-hover/resumen:opacity-100 group-has-[:focus-visible]/resumen:opacity-100"
        />
      )}
    </Card>
  );

  return (
    // La entrada (CSS) y la inclinación (resorte) van en elementos distintos: no se pisan el transform.
    <div className="h-full animate-entrar" style={{ animationDelay: `${orden * 60}ms` }}>
      <Inclinable className="group/resumen h-full rounded-xl">
        {href ? (
          <Link href={href} className="block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {contenido}
          </Link>
        ) : (
          contenido
        )}
      </Inclinable>
    </div>
  );
}
