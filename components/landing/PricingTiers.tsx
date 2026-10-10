"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useState, type PointerEvent, type ReactNode } from "react";

import { BordeBrillante } from "@/components/landing/Botones";
import { CLASE_CTA_CRISTAL } from "@/components/landing/estilos";
import { useMovimientoReducido, usePlanElegido } from "@/components/landing/EstadoLanding";
import { EASE_OUT, Revelar } from "@/components/landing/Revelar";
import type { PlanDemo } from "@/lib/landing/demo";
import { definicionPlan, type CicloFacturacion, type EdicionPlan, type PlanAgencia } from "@/lib/planes/planes";
import { cn } from "@/lib/utils";

type Tarjeta = {
  id: Exclude<PlanDemo, "indeciso">;
  plan: PlanAgencia;
  lema: string;
  descripcion: string;
  previo: string;
  /** Lo que trae en ambas ediciones. */
  incluye: string[];
  /** Lo que cambia entre Básico y Pro. */
  porEdicion: Record<EdicionPlan, string[]>;
  cta: string;
  destacado?: boolean;
};

// Qué se anuncia de cada plan (se edita aquí). Los precios y los límites vienen de lib/planes, los
// mismos que aplica el CRM.
const TARJETAS: Tarjeta[] = [
  {
    id: "agente",
    plan: "AGENTE",
    lema: "Para el agente independiente",
    descripcion: "Tu cartera en orden y tus pólizas al día, sin hojas de cálculo.",
    previo: "Incluye:",
    incluye: ["CRM: clientes, pólizas, recibos y renovaciones", "Conciliación de recibos"],
    porEdicion: {
      BASICO: ["1 usuario", "Captura manual con validación por ramo"],
      PRO: ["1 usuario", "50 escaneos OCR con IA al mes"],
    },
    cta: "Elegir Agente",
  },
  {
    id: "broker",
    plan: "BROKER",
    lema: "Para despachos y promotorías",
    descripcion: "Tu equipo trabaja la misma cartera y tú controlas quién ve qué.",
    previo: "Todo lo de Agente, y además:",
    incluye: ["Administrador para el dueño: controla usuarios y permisos", "Conciliación financiera"],
    porEdicion: {
      BASICO: ["3 usuarios", "250 escaneos OCR con IA al mes"],
      PRO: ["Usuarios ilimitados", "Escaneos con IA sin límite", "Marca blanca", "Base de datos aislada"],
    },
    cta: "Agendar Demo VIP",
    destacado: true,
  },
];

const CICLOS: { id: CicloFacturacion; texto: string }[] = [
  { id: "MENSUAL", texto: "Mensual" },
  { id: "ANUAL", texto: "Anual" },
];

const EDICIONES: { id: EdicionPlan; texto: string }[] = [
  { id: "BASICO", texto: "Básico" },
  { id: "PRO", texto: "Pro" },
];

const pesos = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

/** Luz que sigue al cursor dentro de la tarjeta: solo cambia dos variables CSS, sin renderizar. */
function seguirCursor(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const caja = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - caja.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - caja.top}px`);
}

export function PricingTiers() {
  const [ciclo, setCiclo] = useState<CicloFacturacion>("MENSUAL");
  const [edicion, setEdicion] = useState<EdicionPlan>("PRO");
  // Con el cursor sobre un plan, los otros se atenúan.
  const [enfocado, setEnfocado] = useState<Tarjeta["id"] | null>(null);

  return (
    <section id="planes" aria-labelledby="planes-titulo" className="relative scroll-mt-16 px-4 py-28 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Revelar className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium tracking-[0.22em] text-[#8ea8ff] uppercase">Planes</p>
          <h2
            id="planes-titulo"
            className="mt-4 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-balance [font-feature-settings:normal]"
          >
            Un plan para cada etapa de tu agencia.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-pretty text-white/55 sm:text-lg">
            Empieza con Básico y pasa a Pro cuando lo necesites. Del agente independiente a la promotoría, sin
            cambiar de sistema.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Segmentado
              leyenda="Edición"
              nombre="edicion"
              layoutId="edicion-activa"
              opciones={EDICIONES}
              valor={edicion}
              onCambio={setEdicion}
              extra={(id, activo) =>
                id === "PRO" && <Sparkles className={cn("size-3.5", activo ? "text-[#3d6bff]" : "text-[#8ea8ff]")} aria-hidden />
              }
            />
            <Segmentado
              leyenda="Facturación"
              nombre="ciclo"
              layoutId="ciclo-activo"
              opciones={CICLOS}
              valor={ciclo}
              onCambio={setCiclo}
              extra={(id, activo) =>
                id === "ANUAL" && (
                  <span
                    className={cn(
                      "relative rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap [transition:background-color_200ms_ease,color_200ms_ease]",
                      activo ? "bg-[#3d6bff] text-white" : "bg-[#3d6bff]/20 text-[#c9d3ff]"
                    )}
                  >
                    2 meses gratis
                  </span>
                )
              }
            />
          </div>
        </Revelar>

        <div
          className="mx-auto mt-14 grid max-w-lg gap-6 md:max-w-4xl md:grid-cols-2 md:items-stretch"
          onPointerLeave={() => setEnfocado(null)}
        >
          {TARJETAS.map((tarjeta, i) => (
            <Revelar key={tarjeta.id} retraso={i * 100} className="h-full">
              <div
                onPointerEnter={(e) => e.pointerType === "mouse" && setEnfocado(tarjeta.id)}
                data-atenuado={enfocado !== null && enfocado !== tarjeta.id}
                className="h-full [transition:translate_250ms_var(--ease-out),opacity_250ms_ease] hover:-translate-y-1 data-[atenuado=true]:opacity-60"
              >
                {tarjeta.destacado ? (
                  // Borde brillante continuo: el mismo degradado que gira detrás de los CTA VIP.
                  <BordeBrillante className="flex h-full rounded-3xl shadow-[0_40px_120px_-40px_rgba(61,107,255,0.6)]">
                    <TarjetaPlan tarjeta={tarjeta} ciclo={ciclo} edicion={edicion} className="rounded-[calc(1.5rem-1px)] bg-[#07080d]" />
                  </BordeBrillante>
                ) : (
                  <TarjetaPlan
                    tarjeta={tarjeta}
                    ciclo={ciclo}
                    edicion={edicion}
                    className="h-full rounded-3xl border border-[#ffffff15] bg-white/5 backdrop-blur-xl [transition:border-color_250ms_ease] hover:border-white/25"
                  />
                )}
              </div>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Interruptor de dos opciones: radios nativos (flechas del teclado incluidas) con un fondo que se desliza. */
function Segmentado<T extends string>({
  leyenda,
  nombre,
  layoutId,
  opciones,
  valor,
  onCambio,
  extra,
}: {
  leyenda: string;
  nombre: string;
  layoutId: string;
  opciones: { id: T; texto: string }[];
  valor: T;
  onCambio: (valor: T) => void;
  extra?: (id: T, activo: boolean) => ReactNode;
}) {
  const reducir = useMovimientoReducido();
  return (
    <fieldset>
      <legend className="sr-only">{leyenda}</legend>
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md">
        {opciones.map((opcion) => {
          const activo = opcion.id === valor;
          return (
            <label
              key={opcion.id}
              className={cn(
                "relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-5 text-sm font-medium [transition:color_200ms_ease] has-focus-visible:ring-2 has-focus-visible:ring-[#3d6bff]/60",
                activo ? "text-[#030303]" : "text-white/60 hover:text-white"
              )}
            >
              <input
                type="radio"
                name={nombre}
                value={opcion.id}
                checked={activo}
                onChange={() => onCambio(opcion.id)}
                className="sr-only"
              />
              {activo && (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-white shadow-[0_0_24px_-6px_rgba(255,255,255,0.55)]"
                  transition={reducir ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.18 }}
                />
              )}
              <span className="relative">{opcion.texto}</span>
              {extra && <span className="relative inline-flex">{extra(opcion.id, activo)}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function TarjetaPlan({
  tarjeta,
  ciclo,
  edicion,
  className,
}: {
  tarjeta: Tarjeta;
  ciclo: CicloFacturacion;
  edicion: EdicionPlan;
  className?: string;
}) {
  const { elegirPlan } = usePlanElegido();
  const { destacado, porEdicion } = tarjeta;
  const reducir = useMovimientoReducido();

  return (
    <article
      aria-labelledby={`plan-${tarjeta.id}`}
      onPointerMove={seguirCursor}
      className={cn("group/plan relative flex w-full flex-col overflow-hidden p-7 sm:p-9", className)}
    >
      {destacado && (
        // Resplandor cobalto en el borde superior del plan recomendado.
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-3/4 -translate-x-1/2 rounded-full bg-[#3d6bff]/30 blur-3xl"
        />
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_circle_at_var(--x,50%)_var(--y,0%),rgba(61,107,255,0.13),transparent_65%)] opacity-0 [transition:opacity_250ms_ease] group-hover/plan:opacity-100"
      />

      <div className="relative flex items-center justify-between gap-3">
        <h3 id={`plan-${tarjeta.id}`} className="text-lg font-semibold tracking-tight text-white">
          {definicionPlan(tarjeta.plan, edicion).nombre}
        </h3>
        {destacado && (
          <span className="rounded-full border border-[#3d6bff]/50 bg-[#3d6bff]/15 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-[#c9d3ff]">
            Recomendado
          </span>
        )}
      </div>
      <p className={cn("relative mt-1 text-sm font-medium", destacado ? "text-[#8ea8ff]" : "text-white/55")}>{tarjeta.lema}</p>
      {/* Dos renglones fijos en escritorio: los precios de las dos tarjetas quedan a la misma altura. */}
      <p className="relative mt-4 text-sm leading-relaxed text-white/50 md:min-h-[2lh]">{tarjeta.descripcion}</p>

      <div className="relative mt-8 border-y border-white/[0.07] py-6">
        <Precio plan={tarjeta.plan} ciclo={ciclo} edicion={edicion} />
      </div>

      <div className="relative mt-7 flex-1">
        <p className="mb-4 text-xs font-medium tracking-wide text-white/40 uppercase">{tarjeta.previo}</p>
        <ul className="space-y-3.5">
          {tarjeta.incluye.map((texto) => (
            <Rasgo key={texto} destacado={destacado}>
              {texto}
            </Rasgo>
          ))}
        </ul>
        {/* Lo que cambia con la edición entra con un salto corto al cambiar Básico ↔ Pro. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul
            key={edicion}
            initial={{ opacity: 0, transform: reducir ? "translateY(0px)" : "translateY(6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeOut" } }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="mt-3.5 space-y-3.5"
          >
            {porEdicion[edicion].map((texto) => (
              <li
                key={texto}
                className={cn("flex items-start gap-3 text-sm leading-snug", edicion === "PRO" ? "font-medium text-white" : "text-white/75")}
              >
                <Marca destacado={destacado} ia={edicion === "PRO"} />
                {texto}
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>

      <div className="relative mt-9">
        <a
          href="#demo"
          onClick={() => elegirPlan(tarjeta.id, edicion)}
          className={
            destacado
              ? "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-[#030303] [transition:scale_160ms_var(--ease-out),background-color_200ms_ease] hover:bg-[#dfe4ee] active:scale-[0.97]"
              : cn(CLASE_CTA_CRISTAL, "w-full")
          }
        >
          {tarjeta.cta}
          {destacado && <ArrowRight className="size-4" aria-hidden />}
        </a>
      </div>
    </article>
  );
}

function Marca({ destacado, ia }: { destacado?: boolean; ia?: boolean }) {
  return (
    <span
      className={cn(
        "mt-px grid size-[18px] shrink-0 place-items-center rounded-full border",
        destacado || ia ? "border-[#3d6bff]/50 bg-[#3d6bff]/20 text-[#c9d3ff]" : "border-white/15 text-white/70"
      )}
    >
      {ia ? <Sparkles className="size-2.5" aria-hidden /> : <Check className="size-3" aria-hidden />}
    </span>
  );
}

function Rasgo({ destacado, children }: { destacado?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-snug text-white/75">
      <Marca destacado={destacado} />
      {children}
    </li>
  );
}

/** Precio del ciclo y la edición elegidos. Al cambiar da un salto corto: entra desde 10 px abajo con un fundido. */
function Precio({ plan, ciclo, edicion }: { plan: PlanAgencia; ciclo: CicloFacturacion; edicion: EdicionPlan }) {
  const reducir = useMovimientoReducido();
  const precio = definicionPlan(plan, edicion).precio;

  return (
    <div aria-live="polite" className="flex min-h-[4.6rem] flex-col justify-end">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${ciclo}-${edicion}`}
          initial={{ opacity: 0, transform: reducir ? "translateY(0px)" : "translateY(10px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeOut" } }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        >
          <p className="text-[clamp(2.2rem,3.4vw,2.8rem)] leading-none font-semibold tracking-[-0.035em] text-white tabular-nums">
            ${pesos.format(precio[ciclo])}
          </p>
          <p className="mt-2 text-sm text-white/45">{ciclo === "ANUAL" ? "MXN al año" : "MXN al mes"}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
