"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowDown,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Search,
  SendHorizontal,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  ACEPTA_ADJUNTOS,
  esImagen,
  formatoBytes,
  MAX_ADJUNTOS_POR_ENVIO,
  MAX_BYTES_ADJUNTO,
  TIPOS_ADJUNTO,
  tipoDeAdjunto,
} from "@/lib/mensajes/adjuntos";
import {
  agruparMensajes,
  etiquetaDia,
  MAX_TEXTO_MENSAJE,
  partesConEnlaces,
  type AdjuntoChat,
  type ConversacionResumen,
  type MensajeChat,
  type MiembroChat,
} from "@/lib/mensajes/reglas";
import { rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";
import { cn } from "@/lib/utils";

/**
 * Un mensaje en pantalla: los propios esperan la confirmación del servidor o quedan con error;
 * `progreso` (0 a 1) es la subida de su archivo.
 */
export type MensajeUI = MensajeChat & { estado?: "enviando" | "error"; error?: string; progreso?: number };

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
        const adjunto = c.ultimo?.adjunto;
        const contenido = !c.ultimo
          ? ""
          : c.ultimo.eliminado
            ? "Mensaje eliminado"
            : c.ultimo.texto || (adjunto ? (esImagen(adjunto.tipo) ? "Foto" : adjunto.nombre) : "");
        const vista = !c.ultimo
          ? c.tipo === "equipo"
            ? "Aún no hay mensajes. ¡Saluda al equipo!"
            : "Sin mensajes"
          : `${c.ultimo.mio ? "Tú: " : c.tipo === "equipo" ? `${c.ultimo.autor.split(/\s+/)[0]}: ` : ""}${contenido}`;
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
                    {adjunto && !c.ultimo?.eliminado && (
                      <IconoAdjunto tipo={adjunto.tipo} className="mr-1 inline size-3.5 align-[-2px]" />
                    )}
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
  const adjunto = m.eliminado ? null : m.adjunto;
  const imagen = adjunto && esImagen(adjunto.tipo) && adjunto.url ? adjunto : null;
  const subiendo = m.estado === "enviando" && m.progreso !== undefined ? m.progreso : undefined;
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
            "max-w-full overflow-hidden rounded-2xl text-sm whitespace-pre-wrap wrap-anywhere",
            // La imagen va de orilla a orilla; el texto y los archivos, con margen.
            !imagen && "px-3 py-1.5",
            m.eliminado
              ? "border border-dashed bg-transparent text-muted-foreground italic"
              : mio
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted text-foreground",
            m.estado === "enviando" && subiendo === undefined && "opacity-70"
          )}
        >
          {m.eliminado ? (
            "Mensaje eliminado"
          ) : (
            <>
              {imagen && <ImagenAdjunta adjunto={imagen} subiendo={subiendo} />}
              {adjunto && !imagen && <ArchivoAdjunto adjunto={adjunto} mio={mio} subiendo={subiendo} />}
              {m.texto && (
                <div className={cn(imagen && "px-3 py-1.5", adjunto && !imagen && "mt-1.5")}>
                  <TextoMensaje texto={m.texto} mio={mio} />
                </div>
              )}
            </>
          )}
        </div>
        {m.estado === "enviando" && (
          <span className="mt-0.5 px-1 text-[11px] text-muted-foreground tabular-nums">
            {subiendo !== undefined ? `Subiendo ${Math.round(subiendo * 100)}%…` : "Enviando…"}
          </span>
        )}
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

const ICONOS: Record<string, LucideIcon> = {
  PDF: FileText,
  Word: FileText,
  Texto: FileText,
  Excel: FileSpreadsheet,
  CSV: FileSpreadsheet,
  ZIP: FileArchive,
};

function IconoAdjunto({ tipo, className }: { tipo: string; className?: string }) {
  const def = TIPOS_ADJUNTO[tipo];
  const Icono = def?.imagen || tipo === "image/heic" ? ImageIcon : (ICONOS[def?.etiqueta ?? ""] ?? Paperclip);
  return <Icono aria-hidden className={className} />;
}

/** Imagen dentro del chat: reserva su lugar con sus medidas y se abre completa al tocarla. */
function ImagenAdjunta({ adjunto, subiendo }: { adjunto: AdjuntoChat; subiendo?: number }) {
  const imagen = (
    // eslint-disable-next-line @next/next/no-img-element -- archivo privado detrás de una redirección firmada (o vista previa local)
    <img
      src={adjunto.url}
      alt={adjunto.nombre}
      loading="lazy"
      className="block max-h-72 w-72 max-w-full bg-muted object-cover"
      style={adjunto.ancho && adjunto.alto ? { aspectRatio: `${adjunto.ancho} / ${adjunto.alto}` } : undefined}
    />
  );
  if (subiendo !== undefined) {
    return (
      <div className="relative">
        {imagen}
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
          <span className="block h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${Math.round(subiendo * 100)}%` }} />
        </span>
      </div>
    );
  }
  return (
    <a href={adjunto.url} target="_blank" rel="noopener noreferrer" title={`Abrir ${adjunto.nombre}`} className="block">
      {imagen}
    </a>
  );
}

/** Archivo dentro del chat: tipo, nombre y tamaño; se abre (PDF) o se descarga. */
function ArchivoAdjunto({ adjunto, mio, subiendo }: { adjunto: AdjuntoChat; mio: boolean; subiendo?: number }) {
  const def = TIPOS_ADJUNTO[adjunto.tipo];
  const listo = subiendo === undefined && Boolean(adjunto.url);
  return (
    <div
      className={cn(
        "flex min-w-56 items-center gap-3 rounded-xl border px-2.5 py-2 whitespace-normal",
        mio ? "border-primary-foreground/25 bg-primary-foreground/10" : "border-border bg-background/70"
      )}
    >
      <IconoAdjunto tipo={adjunto.tipo} className="size-7 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1">
        {listo && def?.enLinea ? (
          <a href={adjunto.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline" title={adjunto.nombre}>
            {adjunto.nombre}
          </a>
        ) : (
          <p className="truncate font-medium" title={adjunto.nombre}>
            {adjunto.nombre}
          </p>
        )}
        <p className="text-[11px] tabular-nums opacity-75">
          {subiendo !== undefined ? `Subiendo ${Math.round(subiendo * 100)}%` : `${def?.etiqueta ?? "Archivo"} · ${formatoBytes(adjunto.bytes)}`}
        </p>
        {subiendo !== undefined && (
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-current/15">
            <span className="block h-full rounded-full bg-current transition-[width] duration-200 ease-out" style={{ width: `${Math.round(subiendo * 100)}%` }} />
          </span>
        )}
      </div>
      {listo && (
        <a
          href={`${adjunto.url}?descargar=1`}
          aria-label={`Descargar ${adjunto.nombre}`}
          title="Descargar"
          className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-current/10"
        >
          <Download className="size-4" />
        </a>
      )}
    </div>
  );
}

/** Lo que se puede pedir al compositor desde fuera (soltar archivos sobre el panel). */
export type CompositorHandle = { agregarArchivos: (archivos: File[]) => void };

type Elegido = { id: string; archivo: File; previa: string | null };

/**
 * Caja para escribir: Enter envía (Shift+Enter, salto de línea; en el celular, el botón). Los
 * archivos se agregan con el clip, pegando una imagen o soltándolos sobre el panel; cada uno se
 * envía en su propio mensaje y el texto va con el primero.
 */
export function Compositor({
  ref,
  onEnviar,
  placeholder,
  deshabilitado = false,
}: {
  ref?: React.Ref<CompositorHandle>;
  onEnviar: (texto: string, archivos: File[]) => void;
  placeholder: string;
  deshabilitado?: boolean;
}) {
  const [texto, setTexto] = React.useState("");
  const [elegidos, setElegidos] = React.useState<Elegido[]>([]);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const selector = React.useRef<HTMLInputElement>(null);
  const largo = texto.trim().length;
  const excedido = largo > MAX_TEXTO_MENSAJE;
  const listo = (largo > 0 || elegidos.length > 0) && !excedido && !deshabilitado;

  // Las vistas previas locales se liberan al quitarlas, al enviar y al cerrar el panel.
  const vigentes = React.useRef<Elegido[]>([]);
  React.useEffect(() => {
    vigentes.current = elegidos;
  });
  React.useEffect(() => () => vigentes.current.forEach((e) => e.previa && URL.revokeObjectURL(e.previa)), []);

  function agregar(lista: File[]) {
    const rechazados: string[] = [];
    const nuevos: Elegido[] = [];
    for (const archivo of lista) {
      const tipo = tipoDeAdjunto(archivo.name, archivo.type);
      if (!tipo) rechazados.push(`${archivo.name}: ese tipo no se puede enviar`);
      else if (archivo.size === 0 || archivo.size > MAX_BYTES_ADJUNTO) rechazados.push(`${archivo.name}: pasa de 25 MB`);
      else nuevos.push({ id: crypto.randomUUID(), archivo, previa: esImagen(tipo) ? URL.createObjectURL(archivo) : null });
    }
    const cupo = MAX_ADJUNTOS_POR_ENVIO - elegidos.length;
    if (nuevos.length > cupo) {
      rechazados.push(`Máximo ${MAX_ADJUNTOS_POR_ENVIO} archivos por envío`);
      nuevos.splice(Math.max(0, cupo)).forEach((e) => e.previa && URL.revokeObjectURL(e.previa));
    }
    if (rechazados.length > 0) {
      toast.error("Algunos archivos no se agregaron", { description: rechazados.slice(0, 3).join(" · ") });
    }
    if (nuevos.length > 0) setElegidos((actuales) => [...actuales, ...nuevos]);
  }

  React.useImperativeHandle(ref, () => ({ agregarArchivos: agregar }));

  function quitar(id: string) {
    const elegido = elegidos.find((e) => e.id === id);
    if (elegido?.previa) URL.revokeObjectURL(elegido.previa);
    setElegidos((actuales) => actuales.filter((e) => e.id !== id));
  }

  function enviar() {
    if (!listo) return;
    onEnviar(texto, elegidos.map((e) => e.archivo));
    elegidos.forEach((e) => e.previa && URL.revokeObjectURL(e.previa));
    setElegidos([]);
    setTexto("");
    area.current?.focus();
  }

  return (
    <div className="border-t">
      {elegidos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-3 pt-3 pb-1" aria-label="Archivos por enviar">
          {elegidos.map((e) => (
            <li key={e.id} className="relative shrink-0">
              {e.previa ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                <img src={e.previa} alt={e.archivo.name} className="size-16 rounded-lg border object-cover" />
              ) : (
                <div className="flex h-16 w-44 items-center gap-2 rounded-lg border bg-muted/40 px-2">
                  <IconoAdjunto tipo={tipoDeAdjunto(e.archivo.name, e.archivo.type) ?? ""} className="size-6 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium" title={e.archivo.name}>
                      {e.archivo.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">{formatoBytes(e.archivo.size)}</span>
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => quitar(e.id)}
                aria-label={`Quitar ${e.archivo.name}`}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow transition-[scale] duration-150 ease-out active:scale-90"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => selector.current?.click()}
          disabled={deshabilitado}
          aria-label="Adjuntar archivo o imagen"
          title="Adjuntar archivo o imagen (máx. 25 MB)"
        >
          <Paperclip />
        </Button>
        <input
          ref={selector}
          type="file"
          multiple
          accept={ACEPTA_ADJUNTOS}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            agregar([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <div className="min-w-0 flex-1">
          <Textarea
            ref={area}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              // Una captura de pantalla pegada se agrega como imagen.
              const archivos = [...e.clipboardData.files];
              if (archivos.length > 0) {
                e.preventDefault();
                agregar(archivos);
              }
            }}
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
        <Button type="submit" size="icon" className="size-10 shrink-0" disabled={!listo} aria-label="Enviar">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  );
}
