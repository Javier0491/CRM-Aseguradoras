"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";

const ESPERA_MS = 300;

/**
 * Caja de búsqueda cuyo valor vive en la URL (?q=…): el filtrado ocurre en el servidor
 * y el enlace se puede compartir.
 */
export function BusquedaUrl({
  q: qInicial,
  placeholder,
  etiqueta,
}: {
  q: string;
  placeholder: string;
  etiqueta: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(qInicial);
  const [pendiente, startTransition] = React.useTransition();
  const temporizador = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    },
    []
  );

  function cambiar(valor: string) {
    setQ(valor);
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      const texto = valor.trim();
      startTransition(() => {
        router.replace(texto ? `${pathname}?q=${encodeURIComponent(texto)}` : pathname, { scroll: false });
      });
    }, ESPERA_MS);
  }

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={q}
        onChange={(e) => cambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className="bg-card pr-9 pl-9"
      />
      {pendiente && (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
