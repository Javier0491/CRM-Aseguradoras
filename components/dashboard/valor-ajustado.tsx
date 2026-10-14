import { NumeroAnimado } from "@/components/dashboard/numero-animado";
import { cn } from "@/lib/utils";

/**
 * Valor grande de una tarjeta de resumen (text-2xl). Si no cabe en el ancho de su contenedor (un
 * monto de miles de millones en una tarjeta angosta), la letra se reduce lo justo para caber en un
 * renglón; un valor corto se ve igual que siempre. Requiere un contenedor (@container) como padre.
 * Con `animado`, el número cuenta desde cero al aparecer.
 */
export function ValorAjustado({ valor, className, animado }: { valor: string; className?: string; animado?: boolean }) {
  return (
    <p
      style={{ "--largo": valor.length } as React.CSSProperties}
      className={cn("text-[length:min(1.5rem,calc(100cqi/(var(--largo)*0.64)))] leading-8 font-semibold whitespace-nowrap tabular-nums", className)}
    >
      {animado ? <NumeroAnimado valor={valor} /> : valor}
    </p>
  );
}
