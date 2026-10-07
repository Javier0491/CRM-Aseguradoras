"use client";

import * as React from "react";
import { ArrowLeft, MessageCircle, SquarePen } from "lucide-react";
import { toast } from "sonner";

import {
  AvatarChat,
  Compositor,
  ElegirPersona,
  etiquetaRol,
  HiloMensajes,
  ListaConversaciones,
  type MensajeUI,
} from "@/components/mensajes/panel-chat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { hoyISO } from "@/lib/format";
import {
  cargarMensajesAnteriores,
  eliminarMensaje,
  enviarMensaje,
  marcarConversacionLeida,
} from "@/lib/mensajes/actions";
import {
  unirMensajes,
  type ConversacionResumen,
  type MensajeChat,
  type MiembroChat,
  type RespuestaChat,
} from "@/lib/mensajes/reglas";

type Vista =
  | { tipo: "lista" }
  | { tipo: "nuevo" }
  | { tipo: "conversacion"; id: string }
  /** Directa que aún no existe: se crea con el primer mensaje. */
  | { tipo: "borrador"; para: MiembroChat };

type Hilo = { mensajes: MensajeChat[]; pendientes: MensajeUI[]; hayMas: boolean };

/** Cada cuánto se consulta: con una conversación abierta, con el panel abierto y con él cerrado. */
const INTERVALO_MS = { conversacion: 3_000, panel: 6_000, cerrado: 20_000 } as const;

const claveHilo = (v: Vista) => (v.tipo === "conversacion" ? v.id : v.tipo === "borrador" ? `para:${v.para.id}` : null);

/**
 * Mensajería interna del equipo: botón con los no leídos en el encabezado y un panel lateral con el
 * canal de toda la agencia y las conversaciones directas. Se actualiza consultando cada pocos
 * segundos (más seguido con una conversación abierta; nada con la pestaña oculta) y avisa con un
 * toast de lo que llega con el panel cerrado.
 */
export function ChatRapido({ usuarioId, administra }: { usuarioId: string; administra: boolean }) {
  const [abierto, setAbierto] = React.useState(false);
  const [vista, setVista] = React.useState<Vista>({ tipo: "lista" });
  const [resumen, setResumen] = React.useState<{ conversaciones: ConversacionResumen[]; noLeidos: number } | null>(null);
  const [hilos, setHilos] = React.useState<Record<string, Hilo>>({});
  const [miembros, setMiembros] = React.useState<MiembroChat[] | null>(null);
  const [cargandoAnteriores, setCargandoAnteriores] = React.useState(false);
  // Cambiarlo dispara una consulta inmediata (después de enviar o borrar).
  const [pulso, setPulso] = React.useState(0);
  const refrescar = React.useCallback(() => setPulso((p) => p + 1), []);
  const hoy = hoyISO();

  const abiertaId = abierto && vista.tipo === "conversacion" ? vista.id : null;
  const pideMiembros = abierto && vista.tipo === "nuevo" && miembros === null;

  /** Aplica una respuesta del servidor; avisa de lo nuevo si el panel está cerrado (no en la primera carga). */
  const aplicar = React.useEffectEvent((datos: RespuestaChat) => {
    if (!datos.ok) return;
    if (resumen && !abierto) {
      for (const c of datos.conversaciones) {
        const antes = resumen.conversaciones.find((p) => p.id === c.id)?.noLeidos ?? 0;
        if (c.noLeidos > antes && c.ultimo && !c.ultimo.mio) {
          toast(c.tipo === "equipo" ? `${c.ultimo.autor} · Todo el equipo` : c.ultimo.autor, {
            id: `chat-${c.id}`,
            description: c.ultimo.texto.length > 90 ? `${c.ultimo.texto.slice(0, 90)}…` : c.ultimo.texto,
            icon: <MessageCircle className="size-4" />,
            action: { label: "Ver", onClick: () => abrirConversacion(c.id) },
          });
        }
      }
    }
    setResumen({ conversaciones: datos.conversaciones, noLeidos: datos.noLeidos });
    if (datos.abierta) {
      const { id, mensajes, hayMas } = datos.abierta;
      setHilos((h) => ({
        ...h,
        [id]: {
          mensajes: unirMensajes(h[id]?.mensajes ?? [], mensajes),
          pendientes: h[id]?.pendientes ?? [],
          // Con páginas anteriores ya cargadas, decide lo que se cargó; si no, la página reciente.
          hayMas: h[id] ? h[id].hayMas : hayMas,
        },
      }));
    }
    if (datos.miembros) setMiembros(datos.miembros);
  });

  React.useEffect(() => {
    let cancelado = false;
    let temporizador: number | undefined;
    const control = new AbortController();

    async function consultar() {
      if (document.visibilityState === "visible") {
        try {
          const params = new URLSearchParams();
          if (abiertaId) params.set("conversacion", abiertaId);
          if (pideMiembros) params.set("miembros", "1");
          const res = await fetch(`/api/mensajes?${params}`, { cache: "no-store", signal: control.signal });
          if (res.ok) aplicar((await res.json()) as RespuestaChat);
        } catch {
          // Sin conexión o consulta cancelada: se reintenta en la siguiente vuelta.
        }
      }
      if (!cancelado) {
        const ms = abiertaId ? INTERVALO_MS.conversacion : abierto ? INTERVALO_MS.panel : INTERVALO_MS.cerrado;
        temporizador = window.setTimeout(consultar, ms);
      }
    }
    // Al volver a la pestaña se consulta de inmediato.
    function alVolver() {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(temporizador);
      void consultar();
    }

    void consultar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cancelado = true;
      control.abort();
      window.clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [abierto, abiertaId, pideMiembros, pulso]);

  // Conversación abierta: lo que llega se da por leído (hasta el último mensaje que se ve).
  const hiloAbierto = abiertaId ? hilos[abiertaId] : undefined;
  const ultimoVisto = hiloAbierto?.mensajes.at(-1)?.at;
  const noLeidosAbierta = abiertaId ? (resumen?.conversaciones.find((c) => c.id === abiertaId)?.noLeidos ?? 0) : 0;
  React.useEffect(() => {
    if (!abiertaId || !ultimoVisto || noLeidosAbierta === 0) return;
    void marcarConversacionLeida(abiertaId, ultimoVisto).then((r) => {
      if (!r.ok) return;
      setResumen((s) =>
        s && {
          noLeidos: Math.max(0, s.noLeidos - noLeidosAbierta),
          conversaciones: s.conversaciones.map((c) => (c.id === abiertaId ? { ...c, noLeidos: 0 } : c)),
        }
      );
    });
  }, [abiertaId, ultimoVisto, noLeidosAbierta]);

  function abrirConversacion(id: string) {
    setVista({ tipo: "conversacion", id });
    setAbierto(true);
  }

  function elegir(m: MiembroChat) {
    const existente = resumen?.conversaciones.find((c) => c.otro?.id === m.id);
    setVista(existente ? { tipo: "conversacion", id: existente.id } : { tipo: "borrador", para: m });
  }

  /** Envío optimista: el mensaje aparece al instante y se confirma (o queda con error) al responder el servidor. */
  async function enviar(texto: string) {
    const clave = claveHilo(vista);
    if (!clave) return;
    const destino = vista;
    const temporal: MensajeUI = {
      id: `tmp-${crypto.randomUUID()}`,
      autorId: usuarioId,
      autor: "",
      texto,
      at: new Date().toISOString(),
      eliminado: false,
      estado: "enviando",
    };
    setHilos((h) => ({
      ...h,
      [clave]: { mensajes: h[clave]?.mensajes ?? [], hayMas: h[clave]?.hayMas ?? false, pendientes: [...(h[clave]?.pendientes ?? []), temporal] },
    }));
    const r = await enviarMensaje(
      destino.tipo === "conversacion" ? { conversacionId: destino.id, texto } : { para: destino.tipo === "borrador" ? destino.para.id : "", texto }
    );
    if (!r.ok) {
      setHilos((h) =>
        h[clave]
          ? {
              ...h,
              [clave]: {
                ...h[clave],
                pendientes: h[clave].pendientes.map((p) => (p.id === temporal.id ? { ...p, estado: "error", error: r.error } : p)),
              },
            }
          : h
      );
      return;
    }
    setHilos((h) => {
      const { [clave]: previo, ...resto } = h;
      const confirmado = r.conversacionId;
      const base = resto[confirmado] ?? previo;
      return {
        ...resto,
        [confirmado]: {
          mensajes: unirMensajes(base?.mensajes ?? [], [r.mensaje]),
          pendientes: (previo?.pendientes ?? []).filter((p) => p.id !== temporal.id),
          hayMas: base?.hayMas ?? false,
        },
      };
    });
    // La directa nueva ya existe: la vista pasa a ella.
    if (destino.tipo === "borrador") setVista((v) => (v.tipo === "borrador" ? { tipo: "conversacion", id: r.conversacionId } : v));
    refrescar();
  }

  function reintentar(m: MensajeUI) {
    const clave = claveHilo(vista);
    if (!clave) return;
    setHilos((h) => (h[clave] ? { ...h, [clave]: { ...h[clave], pendientes: h[clave].pendientes.filter((p) => p.id !== m.id) } } : h));
    void enviar(m.texto);
  }

  async function eliminar(m: MensajeChat) {
    if (vista.tipo !== "conversacion") return;
    const id = vista.id;
    const marcar = (eliminado: boolean, texto: string) =>
      setHilos((h) =>
        h[id] ? { ...h, [id]: { ...h[id], mensajes: h[id].mensajes.map((x) => (x.id === m.id ? { ...x, eliminado, texto } : x)) } } : h
      );
    marcar(true, "");
    const r = await eliminarMensaje(m.id);
    if (!r.ok) {
      marcar(false, m.texto);
      toast.error(r.error);
      return;
    }
    refrescar();
  }

  async function anteriores() {
    if (vista.tipo !== "conversacion") return;
    const id = vista.id;
    const primero = hilos[id]?.mensajes[0];
    if (!primero) return;
    setCargandoAnteriores(true);
    const r = await cargarMensajesAnteriores(id, { id: primero.id, at: primero.at });
    setCargandoAnteriores(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setHilos((h) => (h[id] ? { ...h, [id]: { ...h[id], mensajes: unirMensajes(h[id].mensajes, r.mensajes), hayMas: r.hayMas } } : h));
  }

  const total = resumen?.noLeidos ?? 0;
  const conversacion = vista.tipo === "conversacion" ? resumen?.conversaciones.find((c) => c.id === vista.id) : undefined;
  const clave = claveHilo(vista);
  const hilo = clave ? hilos[clave] : undefined;
  const esEquipo = conversacion?.tipo === "equipo";
  const titulo =
    vista.tipo === "lista"
      ? "Mensajes"
      : vista.tipo === "nuevo"
        ? "Nuevo mensaje"
        : vista.tipo === "borrador"
          ? vista.para.nombre
          : (conversacion?.titulo ?? "Conversación");
  const subtitulo =
    vista.tipo === "borrador"
      ? etiquetaRol(vista.para.rol)
      : esEquipo
        ? "Canal de toda la agencia"
        : conversacion?.otro
          ? `${etiquetaRol(conversacion.otro.rol)}${conversacion.otro.activo ? "" : " · cuenta desactivada"}`
          : null;

  return (
    <Sheet
      open={abierto}
      onOpenChange={(v) => {
        // Al abrir con el botón se empieza por la lista.
        if (v) setVista({ tipo: "lista" });
        setAbierto(v);
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={total > 0 ? `Mensajes: ${total} sin leer` : "Mensajes"}
        >
          <MessageCircle />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <div className="flex min-h-14 items-center gap-2 border-b px-3 py-2 pr-12">
          {vista.tipo !== "lista" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Volver a las conversaciones"
              onClick={() => setVista({ tipo: "lista" })}
            >
              <ArrowLeft />
            </Button>
          )}
          {(vista.tipo === "conversacion" || vista.tipo === "borrador") && (
            <AvatarChat nombre={titulo} equipo={esEquipo} className="size-8" />
          )}
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base">{titulo}</SheetTitle>
            {subtitulo ? (
              <SheetDescription className="truncate text-xs">{subtitulo}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">Chat interno del equipo</SheetDescription>
            )}
          </div>
          {vista.tipo === "lista" && (
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setVista({ tipo: "nuevo" })}>
              <SquarePen /> Nuevo
            </Button>
          )}
        </div>

        {vista.tipo === "lista" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ListaConversaciones conversaciones={resumen?.conversaciones ?? null} hoy={hoy} onAbrir={(c) => setVista({ tipo: "conversacion", id: c.id })} />
          </div>
        )}
        {vista.tipo === "nuevo" && <ElegirPersona miembros={miembros} onElegir={elegir} />}
        {(vista.tipo === "conversacion" || vista.tipo === "borrador") && (
          <>
            <HiloMensajes
              // Una instancia por conversación: el desplazamiento no se arrastra de una a otra.
              key={clave}
              mensajes={vista.tipo === "borrador" ? (hilo?.mensajes ?? []) : (hilo?.mensajes ?? null)}
              pendientes={hilo?.pendientes}
              yo={usuarioId}
              esEquipo={esEquipo}
              hoy={hoy}
              hayMas={hilo?.hayMas ?? false}
              cargandoAnteriores={cargandoAnteriores}
              puedeModerar={esEquipo && administra}
              onAnteriores={anteriores}
              onEliminar={eliminar}
              onReintentar={reintentar}
            />
            {conversacion?.otro && !conversacion.otro.activo ? (
              <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
                Esta cuenta está desactivada: ya no puede recibir mensajes.
              </p>
            ) : (
              <Compositor
                onEnviar={(t) => void enviar(t)}
                placeholder={esEquipo ? "Escribe a todo el equipo…" : `Escribe a ${titulo.split(/\s+/)[0]}…`}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
