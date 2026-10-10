"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, Check, Loader2 } from "lucide-react";
import { useActionState, useId, type ReactNode } from "react";

import { BordeBrillante } from "@/components/landing/Botones";
import { CLASE_CTA_VIP } from "@/components/landing/estilos";
import { usePlanElegido } from "@/components/landing/EstadoLanding";
import { EASE_OUT, Revelar } from "@/components/landing/Revelar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { solicitarDemo, type EstadoDemo } from "@/lib/landing/actions";
import { CAMPO_TRAMPA, MAX_DEMO, PLANES_DEMO, type CampoDemo } from "@/lib/landing/demo";
import { ETIQUETA_EDICION } from "@/lib/planes/planes";
import { cn } from "@/lib/utils";

const CLASE_CAMPO =
  "h-11 rounded-xl border-white/10 bg-white/[0.03] px-3.5 text-[15px] text-white placeholder:text-white/30 focus-visible:border-[#3d6bff]/70 focus-visible:ring-[#3d6bff]/25 dark:bg-white/[0.03] md:text-sm";

const INCLUYE = [
  "Una sesión privada con el equipo de Atelier Zenith",
  "Recorrido por captura con IA, conciliación y reportes",
  "Te ayudamos a elegir el plan que más le conviene a tu equipo",
];

export function DemoVip() {
  const [estado, accion, enviando] = useActionState<EstadoDemo, FormData>(solicitarDemo, {});

  return (
    <section id="demo" aria-labelledby="demo-titulo" className="relative scroll-mt-16 px-4 py-28 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <Revelar className="lg:pt-6">
          <p className="text-xs font-medium tracking-[0.22em] text-[#8ea8ff] uppercase">Demo VIP</p>
          <h2
            id="demo-titulo"
            className="mt-4 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-balance [font-feature-settings:normal]"
          >
            Conoce ZenSecure con la operación de tu correduría.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-pretty text-white/55 sm:text-lg">
            Déjanos tus datos y te contactamos para agendar la fecha.
          </p>
          <ul className="mt-9 space-y-4">
            {INCLUYE.map((texto) => (
              <li key={texto} className="flex items-start gap-3 text-sm text-white/75">
                <span className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full border border-[#3d6bff]/50 bg-[#3d6bff]/20 text-[#c9d3ff]">
                  <Check className="size-3" aria-hidden />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </Revelar>

        <Revelar retraso={100}>
          <div className="relative overflow-hidden rounded-3xl border border-[#ffffff15] bg-white/5 p-6 backdrop-blur-xl sm:p-8">
            <AnimatePresence mode="wait" initial={false}>
              {estado.ok ? (
                <motion.div
                  key="enviado"
                  initial={{ opacity: 0, transform: "scale(0.97)" }}
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  role="status"
                  className="flex min-h-[420px] flex-col items-center justify-center text-center"
                >
                  <span className="grid size-14 place-items-center rounded-full border border-[#3d6bff]/50 bg-[#3d6bff]/15 text-[#c9d3ff] shadow-[0_0_40px_-8px_rgba(61,107,255,0.8)]">
                    <Check className="size-6" aria-hidden />
                  </span>
                  <p className="mt-6 text-xl font-semibold tracking-tight text-white">Solicitud recibida</p>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/55">
                    Te escribiremos al correo que nos dejaste para agendar tu Demo VIP.
                  </p>
                </motion.div>
              ) : (
                <motion.div key="formulario" exit={{ opacity: 0, transform: "scale(0.98)" }} transition={{ duration: 0.2, ease: EASE_OUT }}>
                  <FormularioDemo estado={estado} accion={accion} enviando={enviando} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Revelar>
      </div>
    </section>
  );
}

function FormularioDemo({
  estado,
  accion,
  enviando,
}: {
  estado: EstadoDemo;
  accion: (formData: FormData) => void;
  enviando: boolean;
}) {
  const { plan, edicion, elegirPlan } = usePlanElegido();
  const valores = estado.valores;

  return (
    <form action={accion} noValidate className="space-y-5">
      {/* Trampa para bots: fuera de la vista y del orden de tabulación. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Sitio web
          <input type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo nombre="nombre" etiqueta="Nombre" error={estado.errores?.nombre}>
          {(props) => (
            <Input {...props} autoComplete="name" maxLength={MAX_DEMO.nombre} defaultValue={valores?.nombre} className={CLASE_CAMPO} />
          )}
        </Campo>
        <Campo nombre="correo" etiqueta="Correo de trabajo" error={estado.errores?.correo}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              placeholder="nombre@tucorreduria.mx"
              maxLength={MAX_DEMO.correo}
              defaultValue={valores?.correo}
              className={CLASE_CAMPO}
            />
          )}
        </Campo>
        <Campo nombre="correduria" etiqueta="Correduría o agencia" error={estado.errores?.correduria}>
          {(props) => (
            <Input
              {...props}
              autoComplete="organization"
              maxLength={MAX_DEMO.correduria}
              defaultValue={valores?.correduria}
              className={CLASE_CAMPO}
            />
          )}
        </Campo>
        <Campo nombre="telefono" etiqueta="Teléfono" opcional error={estado.errores?.telefono}>
          {(props) => (
            <Input
              {...props}
              type="tel"
              autoComplete="tel"
              maxLength={MAX_DEMO.telefono}
              defaultValue={valores?.telefono}
              className={CLASE_CAMPO}
            />
          )}
        </Campo>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-white/60">
          Plan de interés
          {edicion && plan !== "indeciso" && (
            <span className="ml-1.5 font-normal text-white/40">· edición {ETIQUETA_EDICION[edicion]}</span>
          )}
        </legend>
        {/* La edición (Básico o Pro) viene de la tarjeta de precios. */}
        <input type="hidden" name="edicion" value={edicion ?? ""} />
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 sm:grid-cols-4">
          {PLANES_DEMO.map((opcion) => (
            <label
              key={opcion.valor}
              className="relative flex h-9 cursor-pointer items-center justify-center rounded-lg text-xs font-medium text-white/55 [transition:background-color_200ms_ease,color_200ms_ease] has-checked:bg-white/10 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-[#3d6bff]/50 hover:text-white/80"
            >
              <input
                type="radio"
                name="plan"
                value={opcion.valor}
                checked={plan === opcion.valor}
                onChange={() => elegirPlan(opcion.valor)}
                className="sr-only"
              />
              {opcion.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <Campo nombre="mensaje" etiqueta="¿Algo que debamos saber?" opcional error={estado.errores?.mensaje}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            maxLength={MAX_DEMO.mensaje}
            defaultValue={valores?.mensaje}
            placeholder="Aseguradoras con las que trabajas, número de ejecutivos, sistema actual…"
            className={cn(CLASE_CAMPO, "h-auto min-h-24 py-3")}
          />
        )}
      </Campo>

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}

      <BordeBrillante className="w-full">
        <button type="submit" disabled={enviando} className={cn(CLASE_CTA_VIP, "disabled:opacity-70")}>
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {enviando ? "Enviando…" : "Agendar Demo VIP"}
          {!enviando && <ArrowRight className="size-4" aria-hidden />}
        </button>
      </BordeBrillante>
      <p className="text-center text-xs text-white/35">Usamos tus datos solo para contactarte sobre la demo.</p>
    </form>
  );
}

type PropsCampo = {
  id: string;
  name: CampoDemo;
  required?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

function Campo({
  nombre,
  etiqueta,
  opcional,
  error,
  children,
}: {
  nombre: CampoDemo;
  etiqueta: string;
  opcional?: boolean;
  error?: string;
  children: (props: PropsCampo) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-baseline justify-between text-xs font-medium text-white/60">
        {etiqueta}
        {opcional && <span className="font-normal text-white/30">Opcional</span>}
      </label>
      {children({
        id,
        name: nombre,
        required: !opcional,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? `${id}-error` : undefined,
      })}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
