"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { Tabs } from "@/components/ui/tabs";

/**
 * Pestañas cuya selección vive en la URL (?tab=…): al cambiar de pestaña se reescribe la URL sin
 * recargar, y un enlace a otra pestaña de la misma página (p. ej. una tarjeta de resumen) la abre
 * aunque la página ya esté a la vista. Sin `tab` válido en la URL se muestra la primera de `pestanas`.
 */
export function PestanasUrl({
  pestanas,
  className,
  children,
}: {
  pestanas: readonly string[];
  className?: string;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const predeterminada = pestanas[0];
  const enUrl = params.get("tab");
  const deUrl = enUrl && pestanas.includes(enUrl) ? enUrl : predeterminada;
  const [valor, setValor] = React.useState(deUrl);
  const [urlPrevia, setUrlPrevia] = React.useState(deUrl);

  // Una navegación (enlace, atrás/adelante) cambia la URL: la pestaña la sigue.
  if (deUrl !== urlPrevia) {
    setUrlPrevia(deUrl);
    setValor(deUrl);
  }

  function cambiar(siguiente: string) {
    setValor(siguiente);
    const nuevos = new URLSearchParams(params.toString());
    if (siguiente === predeterminada) nuevos.delete("tab");
    else nuevos.set("tab", siguiente);
    const query = nuevos.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  return (
    <Tabs value={valor} onValueChange={cambiar} className={className}>
      {children}
    </Tabs>
  );
}
