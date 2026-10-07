import { cn } from "@/lib/utils";

/**
 * Valor grande de una tarjeta de resumen (text-2xl). Si no cabe en el ancho de su contenedor (un
 * monto de miles de millones en una tarjeta angosta), la letra se reduce lo justo para caber en un
 * renglón; un valor corto se ve igual que siempre. Requiere un contenedor (@container) como padre.
 */
export function ValorAjustado({ valor, className }: { valor: string; className?: string }) {
  return (
    <p
      style={{ "--largo": valor.length } as React.CSSProperties}
      className={cn("text-[length:min(1.5rem,calc(100cqi/(var(--largo)*0.64)))] leading-8 font-semibold whitespace-nowrap tabular-nums", className)}
    >
      {valor}
    </p>
  );
}
