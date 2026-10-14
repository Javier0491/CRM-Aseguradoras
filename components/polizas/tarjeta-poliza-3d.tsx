"use client";

import * as React from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

export type EstadoTarjetaPoliza = "vigente" | "por_vencer" | "vencida" | "cancelada";

/** Resorte de la inclinación y del reflejo: sigue al cursor con inercia, sin rebotar. */
const RESORTE = { stiffness: 180, damping: 20, mass: 0.7 };
const INCLINACION = 12;

const fechaCorta = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

const ETIQUETA_ESTADO: Record<EstadoTarjetaPoliza, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

/**
 * La póliza como una credencial física: del color de su aseguradora, con el número, el cliente y la
 * vigencia, y una barra de cuánto lleva de su vigencia. Se inclina en 3D hacia el cursor y su
 * reflejo holográfico se mueve con ella. Cancelada se ve apagada y con sello. Es decorativa: todo
 * lo que muestra está también en la página como texto.
 */
export function TarjetaPoliza3D({
  numero,
  aseguradora,
  color,
  ramo,
  cliente,
  inicio,
  fin,
  hoy,
  estado,
}: {
  numero: string;
  aseguradora: string;
  /** Color de la aseguradora (#RRGGBB) o null. */
  color: string | null;
  ramo: string;
  cliente: string;
  /** Fechas YYYY-MM-DD. */
  inicio: string;
  fin: string;
  hoy: string;
  estado: EstadoTarjetaPoliza;
}) {
  const reducir = useReducedMotion();
  // Posición del cursor sobre la tarjeta (0–1); 0.5 es el centro.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, RESORTE);
  const sy = useSpring(py, RESORTE);
  const rotateY = useTransform(sx, [0, 1], [-INCLINACION, INCLINACION]);
  const rotateX = useTransform(sy, [0, 1], [INCLINACION, -INCLINACION]);
  const brilloX = useTransform(sx, [0, 1], [0, 100]);
  const brilloY = useTransform(sy, [0, 1], [0, 100]);
  const reflejo = useMotionTemplate`radial-gradient(circle at ${brilloX}% ${brilloY}%, rgb(255 255 255 / 0.32), transparent 55%)`;
  const holograma = useMotionTemplate`linear-gradient(115deg, transparent 20%, rgb(255 0 140 / 0.14) ${brilloX}%, rgb(0 220 255 / 0.14) calc(${brilloX}% + 12%), rgb(255 230 0 / 0.12) calc(${brilloX}% + 24%), transparent 80%)`;

  function mover(e: React.PointerEvent<HTMLDivElement>) {
    if (reducir || e.pointerType !== "mouse") return;
    const caja = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - caja.left) / caja.width);
    py.set((e.clientY - caja.top) / caja.height);
  }
  function soltar() {
    px.set(0.5);
    py.set(0.5);
  }

  const total = dia(fin) - dia(inicio);
  const avance = total > 0 ? Math.min(1, Math.max(0, (dia(hoy) - dia(inicio)) / total)) : 0;
  const base = color ?? "#3f3f46";
  const apagada = estado === "cancelada";

  return (
    <div className="[perspective:1100px]" onPointerMove={mover} onPointerLeave={soltar}>
      <motion.div
        aria-hidden
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className={cn(
          "relative aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl text-white select-none",
          "shadow-[0_30px_60px_-25px_rgb(0_0_0/0.7),0_0_0_1px_rgb(255_255_255/0.08)_inset]",
          apagada && "grayscale-[0.85]"
        )}
      >
        {/* Fondo: el color de la aseguradora en degradado, con un patrón de líneas finas. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${base} 85%, white) 0%, ${base} 45%, color-mix(in srgb, ${base} 45%, black) 100%)`,
          }}
        />
        <div className="absolute inset-0 opacity-[0.12] [background-image:repeating-linear-gradient(135deg,white_0_1px,transparent_1px_9px)]" />
        <motion.div className="absolute inset-0 mix-blend-color-dodge" style={{ backgroundImage: holograma }} />
        <motion.div className="absolute inset-0" style={{ backgroundImage: reflejo }} />

        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight drop-shadow">{aseguradora}</p>
              <p className="text-[11px] text-white/70">{ramo}</p>
            </div>
            <span className="shrink-0 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase backdrop-blur-sm">
              {ETIQUETA_ESTADO[estado]}
            </span>
          </div>

          {/* Chip dorado, como en una tarjeta física. */}
          <span className="h-7 w-10 rounded-md bg-[linear-gradient(135deg,#f6e3a8,#c79a3c_45%,#f2d98f_70%,#a8792a)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.2)]" />

          <div className="space-y-2.5">
            <p className="truncate font-mono text-xl font-semibold tracking-[0.12em] drop-shadow-[0_1px_2px_rgb(0_0_0/0.4)]">{numero}</p>
            <div className="flex items-end justify-between gap-3 text-[11px]">
              <div className="min-w-0">
                <p className="text-[9px] tracking-wider text-white/60 uppercase">Contratante</p>
                <p className="truncate font-medium uppercase">{cliente}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[9px] tracking-wider text-white/60 uppercase">Vigencia</p>
                <p className="font-medium tabular-nums">
                  {fechaCorta.format(dia(inicio))} – {fechaCorta.format(dia(fin))}
                </p>
              </div>
            </div>
            {/* Cuánto lleva de su vigencia. */}
            <div className="h-1 overflow-hidden rounded-full bg-black/30">
              <div
                className="animate-barra h-full rounded-full bg-white/85 shadow-[0_0_8px_rgb(255_255_255/0.6)]"
                style={{ width: `${avance * 100}%`, animationDelay: "500ms" }}
              />
            </div>
          </div>
        </div>

        {apagada && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-md border-2 border-white/70 px-3 py-1 text-lg font-bold tracking-[0.3em] text-white/80 uppercase">
            Cancelada
          </span>
        )}
      </motion.div>
    </div>
  );
}
