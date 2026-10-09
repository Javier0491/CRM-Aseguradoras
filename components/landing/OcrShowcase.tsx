"use client";

import { AnimatePresence, animate, motion, useInView, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { CalendarClock, Check, FileText, LockKeyhole, Network, Scale, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useMovimientoReducido } from "@/components/landing/EstadoLanding";
import { EASE_OUT, Revelar } from "@/components/landing/Revelar";
import { cn } from "@/lib/utils";

/** Carátula de ejemplo (datos ficticios). `barra`: largo del valor impreso en el PDF simulado. */
const CAMPOS = [
  { etiqueta: "Ramo", valor: "Gastos Médicos Mayores", barra: "w-36" },
  { etiqueta: "Póliza", valor: "GMM-2026-004817", barra: "w-24" },
  { etiqueta: "Contratante", valor: "Grupo Industrial Valle Norte", barra: "w-44" },
  { etiqueta: "RFC", valor: "GIV180412KT3", barra: "w-20" },
  { etiqueta: "Vigencia", valor: "01/11/2026 – 01/11/2027", barra: "w-32" },
  { etiqueta: "Prima total", valor: "$48,920.00 MXN", barra: "w-20" },
  { etiqueta: "Forma de pago", valor: "Mensual", barra: "w-14" },
];

type Fase = "reposo" | "subiendo" | "leyendo" | "validando" | "listo";

const ESTADOS: Record<Fase, string> = {
  reposo: "En espera",
  subiendo: "Recibiendo PDF…",
  leyendo: "Leyendo carátula…",
  validando: "Validando campos…",
  listo: "Lista para guardar",
};

/** El escaneo es un progreso: velocidad constante, sin curva. */
const DURACION_ESCANEO_S = 3.2;

const VALORES = [
  {
    icono: Scale,
    titulo: "Conciliación de recibos",
    texto: "Cruza el estado de cuenta de la aseguradora con tus recibos y señala cada diferencia para aclararla.",
  },
  {
    icono: Network,
    titulo: "Cada agencia, aislada",
    texto: "Multi-tenant desde el origen: cada consulta lleva su agencia y cada cambio queda en la bitácora.",
  },
  {
    icono: LockKeyhole,
    titulo: "Tus documentos, protegidos",
    texto: "La IA lee la carátula con el almacenamiento desactivado y lo extraído se valida antes de guardarse.",
  },
];

export function OcrShowcase() {
  return (
    <section id="ia" aria-labelledby="ia-titulo" className="relative scroll-mt-16 px-4 py-28 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Revelar className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium tracking-[0.22em] text-[#8ea8ff] uppercase">Captura inteligente</p>
          <h2
            id="ia-titulo"
            className="mt-4 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-balance [font-feature-settings:normal]"
          >
            De PDF a póliza capturada, sin teclear.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-pretty text-white/55 sm:text-lg">
            Arrastra la carátula: la IA de OpenAI lee el documento y ZenSecure valida cada campo con las mismas reglas
            de la captura manual antes de guardarlo.
          </p>
        </Revelar>

        <Revelar retraso={120} className="mt-16">
          <DemoEscaneo />
        </Revelar>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {VALORES.map(({ icono: Icono, titulo, texto }, i) => (
            <Revelar key={titulo} retraso={i * 80}>
              <article className="h-full rounded-2xl border border-[#ffffff15] bg-white/5 p-6 backdrop-blur-xl">
                <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[#8ea8ff]">
                  <Icono className="size-[18px]" aria-hidden />
                </span>
                <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-white">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{texto}</p>
              </article>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Simulación en bucle mientras está en pantalla: entra el PDF, un haz lo recorre y cada campo
 * aparece en la tarjeta justo cuando el haz pasa por su renglón. Con "reducir movimiento" se
 * muestra el resultado final, quieto.
 */
function DemoEscaneo() {
  const contenedor = useRef<HTMLElement>(null);
  const documento = useRef<HTMLDivElement>(null);
  const filas = useRef<(HTMLDivElement | null)[]>([]);
  const umbrales = useRef<number[]>([]);
  const visible = useInView(contenedor, { amount: 0.35 });
  const quieto = useMovimientoReducido();

  const [fase, setFase] = useState<Fase>("reposo");
  const [extraidos, setExtraidos] = useState(0);
  const [ciclo, setCiclo] = useState(0);
  const progreso = useMotionValue(0);
  // El haz mide lo mismo que el documento y la línea va en su borde inferior: -100 % → 0 la lleva de arriba abajo.
  const haz = useTransform(progreso, (v) => `translateY(${(v - 1) * 100}%)`);

  useMotionValueEvent(progreso, "change", (v) => {
    setExtraidos(umbrales.current.filter((u) => v >= u).length);
  });

  useEffect(() => {
    if (!visible || quieto) return;
    let activo = true;
    let escaneo: ReturnType<typeof animate> | undefined;
    const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

    async function repetir() {
      while (activo) {
        await esperar(250);
        if (!activo) return;
        progreso.jump(0);
        setCiclo((c) => c + 1);
        setFase("subiendo");

        await esperar(1100);
        if (!activo) return;
        // Altura de cada renglón dentro del documento (0 arriba, 1 abajo), ya con la entrada terminada.
        const doc = documento.current?.getBoundingClientRect();
        umbrales.current = filas.current.map((fila) => {
          const caja = fila?.getBoundingClientRect();
          return doc && caja ? (caja.top + caja.height / 2 - doc.top) / doc.height : 1;
        });
        setFase("leyendo");
        escaneo = animate(progreso, 1, { duration: DURACION_ESCANEO_S, ease: "linear" });
        await escaneo;
        if (!activo) return;

        setFase("validando");
        await esperar(900);
        if (!activo) return;
        setFase("listo");
        await esperar(3800);
      }
    }
    void repetir();
    return () => {
      activo = false;
      escaneo?.stop();
    };
  }, [visible, quieto, progreso]);

  const faseVista: Fase = quieto ? "listo" : fase;
  const leidos = quieto ? CAMPOS.length : extraidos;
  const subido = faseVista !== "reposo" && faseVista !== "subiendo";
  const procesando = faseVista === "leyendo" || faseVista === "validando";
  // Sin movimiento, nada entra: cada pieza ya está en su lugar.
  const entrada = (retraso: number) =>
    quieto
      ? { initial: false as const }
      : {
          initial: { opacity: 0, transform: "translateY(-12px)" },
          animate: { opacity: 1, transform: "translateY(0px)" },
          transition: { duration: 0.5, ease: EASE_OUT, delay: retraso },
        };

  return (
    <figure
      ref={contenedor}
      className="grid items-center gap-6 rounded-[28px] border border-[#ffffff15] bg-white/[0.03] p-5 backdrop-blur-xl sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-8"
    >
      <figcaption className="sr-only">
        Demostración: un PDF de póliza entra, la IA lo escanea y sus datos aparecen separados en campos listos para
        guardarse.
      </figcaption>

      {/* PDF de póliza */}
      <div aria-hidden className="flex flex-col items-center gap-3">
        <motion.div
          key={`archivo-${ciclo}`}
          {...entrada(0)}
          className="flex w-full max-w-[340px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#3d6bff]/15 text-[#8ea8ff]">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white/85">caratula_valle-norte.pdf</p>
            <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
              <motion.span
                key={`carga-${ciclo}`}
                className="block h-full origin-left bg-[#8ea8ff]"
                initial={quieto ? false : { transform: "scaleX(0)" }}
                animate={{ transform: "scaleX(1)" }}
                transition={{ duration: 0.7, ease: "linear", delay: 0.15 }}
              />
            </div>
          </div>
          {subido ? (
            <Check className="size-4 shrink-0 text-[#8ea8ff]" />
          ) : (
            <span className="shrink-0 text-[11px] text-white/40 tabular-nums">1.8 MB</span>
          )}
        </motion.div>

        <div
          ref={documento}
          className="relative aspect-[8.5/11] w-full max-w-[340px] overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.02))] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
        >
          <motion.div key={`documento-${ciclo}`} {...entrada(0.35)} className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="size-6 rounded-full bg-gradient-to-br from-white/45 to-white/10" />
                <div className="space-y-1">
                  <span className="block h-1.5 w-16 rounded-sm bg-white/30" />
                  <span className="block h-1 w-10 rounded-sm bg-white/15" />
                </div>
              </div>
              <span className="text-[8px] font-semibold tracking-[0.18em] text-white/40 uppercase">Carátula de póliza</span>
            </div>
            <div className="mt-4 h-px bg-white/10" />

            <div className="mt-1 flex flex-1 flex-col justify-around">
              {CAMPOS.map((campo, i) => (
                <div
                  key={campo.etiqueta}
                  ref={(fila) => {
                    filas.current[i] = fila;
                  }}
                  data-leido={i < leidos}
                  className="group/fila"
                >
                  <span className="block text-[8px] tracking-[0.14em] text-white/35 uppercase">{campo.etiqueta}</span>
                  {/* Al pasar el haz, el valor queda enmarcado como una detección. */}
                  <span className="-mx-1 mt-0.5 inline-flex h-3.5 items-center rounded-[4px] border border-transparent px-1 [transition:border-color_300ms_ease,background-color_300ms_ease] group-data-[leido=true]/fila:border-[#8ea8ff]/70 group-data-[leido=true]/fila:bg-[#3d6bff]/15">
                    <span className={cn("h-1.5 rounded-sm bg-white/25", campo.barra)} />
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-end justify-between">
              <span className="h-px w-24 bg-white/20" />
              <span className="size-7 rounded-sm border border-white/15" />
            </div>
          </motion.div>

          <motion.div
            style={{ transform: haz }}
            className={cn(
              "pointer-events-none absolute inset-0 [transition:opacity_300ms_ease]",
              faseVista === "leyendo" ? "opacity-100" : "opacity-0"
            )}
          >
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#3d6bff]/25" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-[#c9d3ff] shadow-[0_0_16px_3px_rgba(61,107,255,0.85)]" />
          </motion.div>
        </div>
      </div>

      <Conector activo={procesando} />

      {/* Datos extraídos */}
      <div aria-hidden className="w-full rounded-2xl border border-[#ffffff15] bg-white/5 p-5">
        {/* En pantallas angostas el estado baja a su propio renglón en vez de partir el título. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="flex items-center gap-2 text-sm font-medium whitespace-nowrap text-white">
            <Sparkles className="size-4 text-[#8ea8ff]" />
            Datos extraídos
          </p>
          <span className="relative inline-flex h-6 items-center justify-end overflow-hidden sm:min-w-36">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={faseVista}
                initial={{ opacity: 0, transform: "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transform: "translateY(-6px)" }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
                  faseVista === "listo" ? "border-[#3d6bff]/40 bg-[#3d6bff]/15 text-white" : "border-white/10 text-white/55"
                )}
              >
                {faseVista === "listo" ? (
                  <Check className="size-3 text-[#8ea8ff]" />
                ) : (
                  <span className={cn("size-1.5 rounded-full", procesando ? "animate-landing-brillo bg-[#8ea8ff]" : "bg-white/30")} />
                )}
                {ESTADOS[faseVista]}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>

        <dl className="mt-4 divide-y divide-white/[0.06]">
          {CAMPOS.map((campo, i) => (
            <div key={campo.etiqueta} data-leido={i < leidos} className="group/campo flex items-center justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-xs text-white/45">{campo.etiqueta}</dt>
              <dd className="relative min-w-0 text-right text-sm font-medium text-white">
                <span className="block translate-y-1 truncate opacity-0 [transition:opacity_300ms_var(--ease-out),translate_300ms_var(--ease-out)] group-data-[leido=true]/campo:translate-y-0 group-data-[leido=true]/campo:opacity-100">
                  {campo.valor}
                </span>
                <span className="absolute top-1/2 right-0 -translate-y-1/2 [transition:opacity_200ms_ease] group-data-[leido=true]/campo:opacity-0">
                  <span className="block h-2 w-24 animate-landing-brillo rounded-full bg-white/10" />
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <div
          className={cn(
            "mt-4 flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-xs [transition:border-color_300ms_ease,background-color_300ms_ease,color_300ms_ease]",
            faseVista === "listo" ? "border-[#3d6bff]/40 bg-[#3d6bff]/10 text-white" : "border-white/[0.06] text-white/35"
          )}
        >
          <CalendarClock className="size-4 shrink-0 text-[#8ea8ff]" />
          12 recibos mensuales programados al guardar
        </div>
      </div>
    </figure>
  );
}

/** Del PDF a los campos: los datos viajan por la línea mientras la IA trabaja. */
function Conector({ activo }: { activo: boolean }) {
  return (
    <div aria-hidden className="flex flex-col items-center gap-3">
      <div className="relative hidden h-3 w-36 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_25%,#000_75%,transparent)] lg:block">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/15" />
        {activo &&
          [0, 1, 2].map((i) => (
            <span key={i} className="absolute inset-0 animate-landing-flujo" style={{ animationDelay: `${i * 530}ms` }}>
              <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-[#c9d3ff] shadow-[0_0_10px_2px_rgba(61,107,255,0.85)]" />
            </span>
          ))}
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide [transition:border-color_300ms_ease,color_300ms_ease,box-shadow_300ms_ease]",
          activo ? "border-[#3d6bff]/50 text-white shadow-[0_0_24px_-6px_rgba(61,107,255,0.8)]" : "border-white/10 text-white/60"
        )}
      >
        <Sparkles className="size-3 text-[#8ea8ff]" />
        OpenAI OCR
      </span>
      <div className="relative h-10 w-px overflow-hidden bg-white/10 lg:hidden">
        {activo && (
          <span className="block h-full w-full animate-landing-recorrido bg-gradient-to-b from-transparent via-[#8ea8ff] to-transparent" />
        )}
      </div>
    </div>
  );
}
