import { ArrowRight, History, ScanText, ShieldCheck } from "lucide-react";

import { BordeBrillante, Magnetico } from "@/components/landing/Botones";
import { CLASE_CTA_CRISTAL, CLASE_CTA_VIP } from "@/components/landing/estilos";
import { cn } from "@/lib/utils";

const TITULO = "El motor de tu correduría, impulsado por IA.";
const LINEAS = [
  ["El", "motor", "de", "tu", "correduría,"],
  ["impulsado", "por", "IA."],
];

/** Entrada escalonada: cada palabra 45 ms después de la anterior (animación CSS, ver globals.css). */
const RETRASO_TITULO_MS = 120;
const ESCALON_MS = 45;
const retrasoPalabra = (linea: number, palabra: number) =>
  RETRASO_TITULO_MS + (linea === 0 ? palabra : LINEAS[0].length + palabra) * ESCALON_MS;

const GARANTIAS = [
  { icono: ShieldCheck, texto: "Cada agencia, aislada" },
  { icono: ScanText, texto: "Lectura de carátulas con IA" },
  { icono: History, texto: "Bitácora de cada cambio" },
];

export function HeroB2B() {
  return (
    <section aria-labelledby="hero-titulo" className="relative flex min-h-svh items-center justify-center px-4 pt-28 pb-28 sm:px-6">
      {/* Penumbra detrás del texto: la red 3D sigue viéndose alrededor sin restar contraste. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_42%_at_50%_47%,rgba(3,3,3,0.55),transparent_78%)]"
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        {/* La firma de Atelier Zenith va en la marca de la barra; aquí, qué es ZenSecure. */}
        <span className="inline-flex animate-landing-entrada items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium tracking-wide text-white/60 backdrop-blur-md">
          <span aria-hidden className="size-1.5 rounded-full bg-[#8ea8ff] shadow-[0_0_8px_rgba(142,168,255,0.9)]" />
          CRM con IA para <span className="text-white/90">Brokers y Agentes de seguros</span>
        </span>

        <h1
          id="hero-titulo"
          className="mt-8 text-[clamp(2.6rem,7.6vw,6.5rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance [font-feature-settings:normal]"
        >
          <span className="sr-only">{TITULO}</span>
          <span aria-hidden className="block">
            {LINEAS.map((palabras, l) => (
              <span key={l} className="block">
                {palabras.map((palabra, p) => (
                  <span key={palabra}>
                    {p > 0 && " "}
                    <span
                      className={cn(
                        // El relleno amplía el área del degradado (acentos y descendentes); el margen negativo lo compensa.
                        "-my-[0.14em] inline-block animate-landing-entrada bg-clip-text py-[0.14em] text-transparent",
                        palabra === "IA."
                          ? "bg-[linear-gradient(100deg,#8ea8ff_0%,#ffffff_55%,#c9d3ff_100%)]"
                          : "bg-[linear-gradient(180deg,#ffffff_30%,rgba(255,255,255,0.62)_100%)]"
                      )}
                      style={{ animationDelay: `${retrasoPalabra(l, p)}ms` }}
                    >
                      {palabra}
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </span>
        </h1>

        <p
          className="mt-7 max-w-2xl animate-landing-entrada text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed text-pretty text-white/60"
          style={{ animationDelay: "520ms" }}
        >
          Automatiza la conciliación de recibos, gestiona pólizas en segundos y escala tu agencia sin límites.
        </p>

        <div
          className="mt-10 flex w-full max-w-sm animate-landing-entrada flex-col items-stretch gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:items-center"
          style={{ animationDelay: "620ms" }}
        >
          <Magnetico>
            <a href="#planes" className={cn(CLASE_CTA_CRISTAL, "w-full sm:w-auto")}>
              Ver Planes
            </a>
          </Magnetico>
          <Magnetico>
            <BordeBrillante className="w-full">
              <a href="#demo" className={cn(CLASE_CTA_VIP, "sm:w-auto")}>
                Agendar Demo VIP
                <ArrowRight className="size-4" aria-hidden />
              </a>
            </BordeBrillante>
          </Magnetico>
        </div>

        <ul
          className="mt-12 flex animate-landing-entrada flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs tracking-wide text-white/45"
          style={{ animationDelay: "760ms" }}
        >
          {GARANTIAS.map(({ icono: Icono, texto }) => (
            <li key={texto} className="inline-flex items-center gap-2">
              <Icono className="size-3.5 text-[#8ea8ff]" aria-hidden />
              {texto}
            </li>
          ))}
        </ul>
      </div>

      {/* Indicador de desplazamiento: una luz que baja por una línea fina. */}
      <div aria-hidden className="absolute bottom-8 left-1/2 hidden h-12 w-px -translate-x-1/2 overflow-hidden bg-white/10 sm:block">
        <span className="block h-full w-full animate-landing-recorrido bg-gradient-to-b from-transparent via-white/80 to-transparent" />
      </div>
    </section>
  );
}
