"use client";

import dynamic from "next/dynamic";

// three.js solo se descarga en la landing y solo en el navegador (WebGL no existe en el servidor).
const Scene3D_SaaS = dynamic(() => import("@/components/landing/Scene3D_SaaS"), { ssr: false });

/** Lienzo fijo detrás de toda la landing. Mientras carga (o sin WebGL) queda el mismo halo en CSS. */
export function Atmosfera() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[#030303]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_40%_at_50%_45%,rgba(61,107,255,0.16),transparent_70%)]" />
      <Scene3D_SaaS />
      {/* Viñeta: oscurece bordes y pie para que el texto se lea sobre la red. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_85%_at_50%_40%,transparent_55%,rgba(3,3,3,0.75)_100%)]" />
    </div>
  );
}
