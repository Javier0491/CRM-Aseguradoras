"use client";

import * as React from "react";
import { AlertCircle, ArrowDown, Loader2, MoreHorizontal, Search, SendHorizontal, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatNumero, iniciales } from "@/lib/format";
import {
  agruparMensajes,
  etiquetaDia,
  MAX_TEXTO_MENSAJE,
  partesConEnlaces,
  type ConversacionResumen,
  type MensajeChat,
  type MiembroChat,
} from "@/lib/mensajes/reglas";
import { rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";
import { cn } from "@/lib/utils";

/** Un mensaje en pantalla: los propios esperan la confirmación del servidor o quedan con error. */
export type MensajeUI = MensajeChat & { estado?: "enviando" | "error"; error?: string };

const hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
const fechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" });

export const etiquetaRol = (rol: string) =>
  rol === "SUPERADMIN" ? "Superadministrador" : (rolLabels[rol as RolUsuario] ?? rol);

/** Hora si es de hoy; si no, "Ayer" o la fecha. */
function cuando(at: string, hoy: string) {
  const dia = etiquetaDia(at, hoy);
  return dia === "Hoy" ? hora.format(new Date(at)) : dia;
}

export function AvatarChat({ nombre, equipo = false, className }: { nombre: string; equipo?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        equipo ? "bg-primary text-primary-foreground" : "bg-primary/12 text-primary",
        className
      )}
    >
      {equipo ? <Users className="size-4" /> : iniciales(nombre)}
    </span>
  );
}

/** Conversaciones: el canal del equipo arriba y las directas de la más reciente a la más antigua. */
export function ListaConversaciones({
  conversaciones,
  hoy,
  onAbrir,
}: {
  conversaciones: ConversacionResumen[] | null;
  hoy: string;
  onAbrir: (c: ConversacionResumen) => void;
}) {
  if (!conversaciones) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {conversaciones.map((c) => {
        const vista = !c.ultimo
          ? c.tipo === "equipo"
            ? "Aún no hay mensajes. ¡Saluda al equipo!"
            : "Sin mensajes"
          : `${c.ultimo.mio ? "Tú: " : c.tipo === "equipo" ? `${c.ultimo.autor.split(/\s+/)[0]}: ` : ""}${c.ultimo.eliminado ? "Mensaje eliminado" : c.ultimo.texto}`;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onAbrir(c)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            >
              <AvatarChat nombre={c.titulo} equipo={c.tipo === "equipo"} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-sm", c.noLeidos > 0 ? "font-semibold" : "font-medium")}>
                    {c.titulo}
                    {c.otro && !c.otro.activo && <span className="font-normal text-muted-foreground"> · desactivada</span>}
                  </span>
                  {c.ultimo && (
                    <span
                      className={cn(
                        "shrink-0 text-[11px] tabular-nums",
                        c.noLeidos > 0 ? "font-medium text-foreground dark:text-primary" : "text-muted-foreground"
                      )}
                    >
                      {cuando(c.ultimo.at, hoy)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      c.noLeidos > 0 ? "text-foreground" : "text-muted-foreground",
                      c.ultimo?.eliminado && "italic"
                    )}
                  >
                    {vista}
                  </span>
                  {c.noLeidos > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                      {c.noLeidos > 99 ? "99+" : c.noLeidos}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Elegir con quién iniciar una conversación (con buscador si el equipo es grande). */
export function ElegirPersona({ miembros, onElegir }: { miembros: MiembroChat[] | null; onElegir: (m: MiembroChat) => void }) {
  const [filtro, setFiltro] = React.useState("");
  if (!miembros) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const visibles = miembros.filter((m) => normalizar(m.nombre).includes(normalizar(filtro.trim())));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {miembros.length > 6 && (
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar persona"
              aria-label="Buscar persona"
              className="pl-8"
              autoFocus
            />
          </div>
        </div>
      )}
      {miembros.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Aún no hay más personas en tu agencia.</p>
      ) : visibles.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nadie coincide con «{filtro.trim()}».</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {visibles.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onElegir(m)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <AvatarChat nombre={m.nombre} className="size-8" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">{etiquetaRol(m.rol)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** El texto de un mensaje con sus enlaces clicables (sin HTML crudo). */
function TextoMensaje({ texto, mio }: { texto: string; mio: boolean }) {
  return (
    <>
      {partesConEnlaces(texto).map((p, i) =>
        p.enlace ? (
          <a
            key={i}
            href={p.texto}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("underline underline-offset-2", mio ? "text-primary-foreground" : "text-primary")}
          >
            {p.texto}
          </a>
        ) : (
          <React.Fragment key={i}>{p.texto}</React.Fragment>
        )
      )}
    </>
  );
}

/**
 * Hilo de una conversación, del más antiguo al más reciente, con separadores de día y mensajes
 * agrupados por autor. Se queda abajo cuando llegan mensajes si ya se estaba abajo; si se subió a
 * leer, ofrece bajar.
 */
export function HiloMensajes({
  mensajes,
  pendientes = [],
  yo,
  esEquipo,
  hoy,
  hayMas,
  cargandoAnteriores = false,
  puedeModerar = false,
  onAnteriores,
  onEliminar,
  onReintentar,
}: {
  mensajes: MensajeChat[] | null;
  pendientes?: MensajeUI[];
  yo: string;
  esEquipo: boolean;
  hoy: string;
  hayMas: boolean;
  cargandoAnteriores?: boolean;
  /** Administrador en el canal del equipo: puede borrar mensajes de otros. */
  puedeModerar?: boolean;
  onAnteriores?: () => void;
  onEliminar?: (m: MensajeChat) => void;
  onReintentar?: (m: MensajeUI) => void;
}) {
  const contenedor = React.useRef<HTMLDivElement>(null);
  // Si se está abajo, el último mensaje que se alcanzó a ver; arriba, se avisa de los nuevos.
  const [abajo, setAbajo] = React.useState(true);
  const [vistoId, setVistoId] = React.useState<string | undefined>(undefined);
  const ultimoId = pendientes.at(-1)?.id ?? mensajes?.at(-1)?.id;
  const ultimoMio = (pendientes.at(-1) ?? mensajes?.at(-1))?.autorId === yo;
  const hayNuevos = !abajo && ultimoId !== undefined && ultimoId !== vistoId;
  // Valores del render actual para el efecto, que solo corre cuando cambia el último mensaje.
  const seguir = React.useRef({ abajo, ultimoMio });
  React.useLayoutEffect(() => {
    seguir.current = { abajo, ultimoMio };
  });

  // Al llegar un mensaje: si se estaba abajo (o es propio) se baja; si no, queda el aviso.
  React.useLayoutEffect(() => {
    const el = contenedor.current;
    if (!el || !ultimoId) return;
    if (seguir.current.abajo || seguir.current.ultimoMio) el.scrollTop = el.scrollHeight;
  }, [ultimoId]);

  function irAbajo() {
    const el = contenedor.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function alDesplazar() {
    const el = contenedor.current;
    if (!el) return;
    const enFondo = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAbajo(enFondo);
    if (enFondo) setVistoId(ultimoId);
  }

  if (!mensajes) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  const lista = agruparMensajes(mensajes, hoy);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={contenedor}
        onScroll={alDesplazar}
        role="log"
        aria-live="polite"
        aria-label="Mensajes"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {hayMas && (
          <div className="mb-3 flex justify-center">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAnteriores} disabled={cargandoAnteriores}>
              {cargandoAnteriores && <Loader2 className="animate-spin" />} Ver mensajes anteriores
            </Button>
          </div>
        )}
        {lista.length === 0 && pendientes.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {esEquipo ? "Escribe el primer mensaje para todo el equipo." : "Escribe el primer mensaje."}
          </p>
        )}
        {lista.map((m) => {
          const mio = m.autorId === yo;
          return (
            <React.Fragment key={m.id}>
              {m.dia && (
                <div className="my-3 flex items-center gap-3 text-[11px] font-medium text-muted-foreground" role="separator">
                  <span className="h-px flex-1 bg-border" />
                  {m.dia}
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <Burbuja
                mensaje={m}
                mio={mio}
                inicioGrupo={m.inicioGrupo}
                conNombre={esEquipo && !mio}
                puedeBorrar={!m.eliminado && (mio || puedeModerar) && Boolean(onEliminar)}
                onEliminar={() => onEliminar?.(m)}
              />
            </React.Fragment>
          );
        })}
        {pendientes.map((m, i) => (
          <Burbuja
            key={m.id}
            mensaje={m}
            mio
            inicioGrupo={i === 0 && lista.at(-1)?.autorId !== yo}
            conNombre={false}
            puedeBorrar={false}
            onReintentar={m.estado === "error" ? () => onReintentar?.(m) : undefined}
          />
        ))}
      </div>
      {hayNuevos && (
        <button
          type="button"
          onClick={irAbajo}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-md transition-[scale] duration-150 ease-out active:scale-95"
        >
          <ArrowDown className="size-3.5" /> Mensajes nuevos
        </button>
      )}
    </div>
  );
}

function Burbuja({
  mensaje: m,
  mio,
  inicioGrupo,
  conNombre,
  puedeBorrar,
  onEliminar,
  onReintentar,
}: {
  mensaje: MensajeUI;
  mio: boolean;
  inicioGrupo: boolean;
  conNombre: boolean;
  puedeBorrar: boolean;
  onEliminar?: () => void;
  onReintentar?: () => void;
}) {
  return (
    <div className={cn("group flex items-end gap-2", mio ? "flex-row-reverse" : "flex-row", inicioGrupo ? "mt-3" : "mt-0.5")}>
      {!mio && (
        <span className="w-7 shrink-0">{inicioGrupo && <AvatarChat nombre={m.autor} className="size-7 text-[10px]" />}</span>
      )}
      <div className={cn("flex max-w-[78%] min-w-0 flex-col", mio ? "items-end" : "items-start")}>
        {inicioGrupo && (
          <span className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[11px] text-muted-foreground">
            {conNombre && <span className="max-w-48 truncate font-medium text-foreground/80">{m.autor}</span>}
            {m.estado !== "enviando" && m.estado !== "error" && <span className="tabular-nums">{hora.format(new Date(m.at))}</span>}
          </span>
        )}
        <div
          title={fechaHora.format(new Date(m.at))}
          className={cn(
            "rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap wrap-anywhere",
            m.eliminado
              ? "border border-dashed bg-transparent text-muted-foreground italic"
              : mio
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted text-foreground",
            m.estado === "enviando" && "opacity-70"
          )}
        >
          {m.eliminado ? "Mensaje eliminado" : <TextoMensaje texto={m.texto} mio={mio} />}
        </div>
        {m.estado === "enviando" && <span className="mt-0.5 px-1 text-[11px] text-muted-foreground">Enviando…</span>}
        {m.estado === "error" && (
          <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-destructive">
            <AlertCircle className="size-3" /> {m.error ?? "No se envió"} ·
            <button type="button" className="font-medium underline underline-offset-2" onClick={onReintentar}>
              Reintentar
            </button>
          </span>
        )}
      </div>
      {puedeBorrar && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mb-0.5 size-6 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0"
              aria-label="Opciones del mensaje"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={mio ? "end" : "start"}>
            <DropdownMenuItem variant="destructive" onSelect={onEliminar}>
              <Trash2 /> Eliminar mensaje
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** Caja para escribir: Enter envía (Shift+Enter, salto de línea; en el celular, el botón). */
export function Compositor({
  onEnviar,
  placeholder,
  deshabilitado = false,
}: {
  onEnviar: (texto: string) => void;
  placeholder: string;
  deshabilitado?: boolean;
}) {
  const [texto, setTexto] = React.useState("");
  const area = React.useRef<HTMLTextAreaElement>(null);
  const largo = texto.trim().length;
  const excedido = largo > MAX_TEXTO_MENSAJE;

  function enviar() {
    if (!largo || excedido || deshabilitado) return;
    onEnviar(texto);
    setTexto("");
    area.current?.focus();
  }

  return (
    <form
      className="flex items-end gap-2 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <div className="min-w-0 flex-1">
        <Textarea
          ref={area}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // En pantallas táctiles Enter hace un salto de línea; se envía con el botón.
            const tactil = window.matchMedia("(pointer: coarse)").matches;
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !tactil) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Mensaje"
          aria-invalid={excedido}
          className="max-h-36 min-h-10 resize-none py-2"
        />
        {largo > MAX_TEXTO_MENSAJE - 200 && (
          <p className={cn("mt-1 text-right text-[11px] tabular-nums", excedido ? "text-destructive" : "text-muted-foreground")}>
            {formatNumero(largo)} / {formatNumero(MAX_TEXTO_MENSAJE)}
          </p>
        )}
      </div>
      <Button type="submit" size="icon" className="size-10 shrink-0" disabled={!largo || excedido || deshabilitado} aria-label="Enviar">
        <SendHorizontal />
      </Button>
    </form>
  );
}
