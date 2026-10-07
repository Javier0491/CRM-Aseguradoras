"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Solo para la galería de desarrollo (/dev/datos-extremos): elige la pantalla, el conjunto de
 * datos y el tema. Es "cromo" de desarrollo, no parte del diseño: gris neutro, fuente del
 * sistema y sin animaciones. El estado vive en la URL, así que recargar lo conserva.
 */
export function BarraDatosDev({
  pantallas,
  pantalla,
  conjuntos,
  conjunto,
  tema,
  hrefs,
}: {
  pantallas: readonly { clave: string; titulo: string }[];
  pantalla: string;
  conjuntos: readonly { clave: string; titulo: string }[];
  conjunto: string;
  tema: "dark" | "light";
  /** URL de cada pantalla, de cada conjunto y del otro tema. */
  hrefs: { pantallas: Record<string, string>; conjuntos: Record<string, string>; tema: string };
}) {
  const router = useRouter();

  // Aplica el tema elegido a <html> (el layout raíz pone el de la sesión).
  React.useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("dark", "light");
    html.classList.add(tema);
  }, [tema]);

  return (
    <nav
      aria-label="Datos de prueba"
      className="fixed inset-x-2 top-2 z-[60] mx-auto flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-neutral-200/95 p-1.5 text-[12px] text-neutral-900 shadow-lg [font-family:system-ui,sans-serif] md:top-auto md:bottom-3"
    >
      <select
        aria-label="Pantalla"
        value={pantalla}
        onChange={(e) => router.push(hrefs.pantallas[e.target.value])}
        className="h-7 rounded-md border border-neutral-300 bg-white px-1.5"
      >
        {pantallas.map((p) => (
          <option key={p.clave} value={p.clave}>
            {p.titulo}
          </option>
        ))}
      </select>
      <span className="flex rounded-md bg-neutral-300/70 p-0.5">
        {conjuntos.map((c) => (
          <Link
            key={c.clave}
            href={hrefs.conjuntos[c.clave]}
            scroll={false}
            aria-current={c.clave === conjunto ? "true" : undefined}
            className={
              c.clave === conjunto
                ? "rounded bg-white px-2 py-1 font-medium shadow-sm"
                : "rounded px-2 py-1 text-neutral-600 hover:text-neutral-900"
            }
          >
            {c.titulo}
          </Link>
        ))}
      </span>
      <Link href={hrefs.tema} scroll={false} className="rounded-md border border-neutral-300 bg-white px-2 py-1">
        {tema === "dark" ? "Oscuro" : "Claro"}
      </Link>
    </nav>
  );
}
