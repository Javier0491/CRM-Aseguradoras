"use client";

import * as React from "react";

import { esLogoUrlValida } from "@/lib/agencias/marca";
import { cn } from "@/lib/utils";

/**
 * Iniciales del nombre de la agencia ("PJ MAGNUS" → "PM", "Seguros Ruiz" → "SR"). Solo cuentan las
 * palabras que empiezan con letra o número ("Hernández & Asociados" → "HA", no "H&").
 */
function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/).filter((p) => /^[\p{L}\p{N}]/u.test(p));
  const ini = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : nombre.trim().slice(0, 2);
  return ini.toUpperCase();
}

/**
 * Logo de la agencia; sin logo, un monograma con sus iniciales en el color de marca. Si la imagen
 * no carga (se borró del almacenamiento, liga rota), también cae al monograma en vez de mostrar el
 * ícono de imagen rota.
 */
export function LogoAgencia({
  nombre,
  logoUrl,
  className,
}: {
  nombre: string;
  logoUrl: string | null;
  className?: string;
}) {
  // La URL que falló: si cambia el logo, se vuelve a intentar con la nueva.
  const [fallida, setFallida] = React.useState<string | null>(null);

  if (esLogoUrlValida(logoUrl) && logoUrl !== fallida) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo de 32 px de un origen variable (Storage o /public); no vale la pena optimizarlo
      <img
        src={logoUrl}
        alt={nombre}
        onError={() => setFallida(logoUrl)}
        // Si falló antes de hidratar, onError ya no se dispara: se revisa al montar.
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFallida(logoUrl);
        }}
        className={cn("size-8 shrink-0 object-contain", className)}
      />
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
