import { cn } from "@/lib/utils";

/**
 * Barra de proporción con brillo del color dado (como "Parte de la cartera" en Aseguradoras):
 * etiqueta y valor arriba, y una barra que crece al aparecer.
 */
export function BarraProporcion({
  etiqueta,
  valor,
  fraccion,
  color,
  retraso = 450,
  className,
}: {
  etiqueta: React.ReactNode;
  /** Texto a la derecha (p. ej. "78.2%" o "2 de 4"). */
  valor: React.ReactNode;
  /** Parte llena, de 0 a 1. */
  fraccion: number;
  /** Color CSS de la barra. */
  color: string;
  /** Milisegundos antes de crecer (para escalonar con la entrada de la tarjeta). */
  retraso?: number;
  className?: string;
}) {
  const parte = Math.min(1, Math.max(0, fraccion));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{etiqueta}</span>
        <span className="shrink-0 font-medium text-foreground tabular-nums">{valor}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="animate-barra h-full rounded-full"
          style={{
            width: `${parte > 0 ? Math.max(parte * 100, 2) : 0}%`,
            animationDelay: `${retraso}ms`,
            backgroundColor: color,
            boxShadow: `0 0 8px color-mix(in srgb, ${color} 75%, white)`,
          }}
        />
      </div>
    </div>
  );
}
