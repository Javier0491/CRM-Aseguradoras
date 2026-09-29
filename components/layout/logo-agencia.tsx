import { esLogoUrlValida } from "@/lib/agencias/marca";
import { cn } from "@/lib/utils";

/** Iniciales del nombre de la agencia ("PJ MAGNUS" → "PM", "Seguros Ruiz" → "SR"). */
function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : nombre.trim().slice(0, 2);
  return ini.toUpperCase();
}

/** Logo de la agencia; sin logo, un monograma con sus iniciales en el color de marca. */
export function LogoAgencia({
  nombre,
  logoUrl,
  className,
}: {
  nombre: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (esLogoUrlValida(logoUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo de 32 px de un origen variable (Storage o /public); no vale la pena optimizarlo
      <img src={logoUrl} alt={nombre} className={cn("size-8 shrink-0 object-contain", className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground",
        className
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}
