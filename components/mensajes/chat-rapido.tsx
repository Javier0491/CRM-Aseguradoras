"use client";

import * as React from "react";
import { ArrowLeft, MessageCircle, SquarePen } from "lucide-react";
import { toast } from "sonner";

import { useAvisosTiempoReal } from "@/components/mensajes/avisos-tiempo-real";
import {
  AvatarChat,
  Compositor,
  ElegirPersona,
  etiquetaRol,
  HiloMensajes,
  ListaConversaciones,
  type CompositorHandle,
  type MensajeUI,
} from "@/components/mensajes/panel-chat";
import { prepararImagen, subirConProgreso } from "@/components/mensajes/subir-adjunto";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { hoyISO } from "@/lib/format";
import {
  cargarMensajesAnteriores,
  eliminarMensaje,
  enviarMensaje,
  marcarConversacionLeida,
  prepararAdjunto,
  type AdjuntoEnviado,
  type DestinoMensaje,
} from "@/lib/mensajes/actions";
import { esImagen, tipoDeAdjunto } from "@/lib/mensajes/adjuntos";
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

/**
 * Cada cuánto se consulta. Con los avisos en tiempo real conectados, solo de respaldo (por si se
 * perdiera alguno); sin ellos, seguido.
 */
const INTERVALO_MS = {
  tiempoReal: { conversacion: 20_000, panel: 30_000, cerrado: 60_000 },
  sondeo: { conversacion: 3_000, panel: 6_000, cerrado: 20_000 },
} as const;

const claveHilo = (v: Vista) => (v.tipo === "conversacion" ? v.id : v.tipo === "borrador" ? `para:${v.para.id}` : null);

/** Lo necesario para (re)intentar un envío: el texto y, si lleva, su archivo. */
type Envio = { texto: string; archivo: File | null };

/**
 * Mensajería interna del equipo: botón con los no leídos en el encabezado y un panel lateral con el
 * canal de toda la agencia y las conversaciones directas, con archivos e imágenes. Los mensajes
 * llegan al instante por Supabase Realtime (el servidor avisa y el navegador vuelve a consultar);
 * si Realtime no está disponible, consulta cada pocos segundos. Avisa con un toast de lo que llega
 * con el panel cerrado.
 */
export function ChatRapido({ usuarioId, administra }: { usuarioId: string; administra: boolean }) {
  const [abierto, setAbierto] = React.useState(false);
  const [vista, setVista] = React.useState<Vista>({ tipo: "lista" });
  const [resumen, setResumen] = React.useState<{ conversaciones: ConversacionResumen[]; noLeidos: number } | null>(null);
  const [hilos, setHilos] = React.useState<Record<string, Hilo>>({});
  const [miembros, setMiembros] = React.useState<MiembroChat[] | null>(null);
  const [cargandoAnteriores, setCargandoAnteriores] = React.useState(false);
  const compositor = React.useRef<CompositorHandle>(null);
  // Envíos pendientes por id temporal (para reintentar) y sus vistas previas locales.
  const envios = React.useRef(new Map<string, Envio & { previa: string | null }>());
  // Cambiarlo dispara una consulta inmediata (después de enviar, borrar o un aviso en tiempo real).
  const [pulso, setPulso] = React.useState(0);
  const refrescar = React.useCallback(() => setPulso((p) => p + 1), []);
  const enTiempoReal = useAvisosTiempoReal(usuarioId, refrescar);
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
          const texto = c.ultimo.texto || (c.ultimo.adjunto ? (esImagen(c.ultimo.adjunto.tipo) ? "Envió una foto" : `Envió ${c.ultimo.adjunto.nombre}`) : "");
          toast(c.tipo === "equipo" ? `${c.ultimo.autor} · Todo el equipo` : c.ultimo.autor, {
            id: `chat-${c.id}`,
            description: texto.length > 90 ? `${texto.slice(0, 90)}…` : texto,
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
    const intervalo = enTiempoReal ? INTERVALO_MS.tiempoReal : INTERVALO_MS.sondeo;

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
        const ms = abiertaId ? intervalo.conversacion : abierto ? intervalo.panel : intervalo.cerrado;
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
  }, [abierto, abiertaId, pideMiembros, pulso, enTiempoReal]);

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

  // Al desmontar se liberan las vistas previas de lo que quedó sin enviar.
  React.useEffect(() => {
    const pendientes = envios.current;
    return () => pendientes.forEach((e) => e.previa && URL.revokeObjectURL(e.previa));
  }, []);

  function abrirConversacion(id: string) {
    setVista({ tipo: "conversacion", id });
    setAbierto(true);
  }

  function elegir(m: MiembroChat) {
    const existente = resumen?.conversaciones.find((c) => c.otro?.id === m.id);
    setVista(existente ? { tipo: "conversacion", id: existente.id } : { tipo: "borrador", para: m });
  }

  function cambiarPendiente(clave: string, id: string, cambio: Partial<MensajeUI>) {
    setHilos((h) =>
      h[clave] ? { ...h, [clave]: { ...h[clave], pendientes: h[clave].pendientes.map((p) => (p.id === id ? { ...p, ...cambio } : p)) } } : h
    );
  }

  function soltarEnvio(id: string) {
    const e = envios.current.get(id);
    if (e?.previa) URL.revokeObjectURL(e.previa);
    envios.current.delete(id);
  }

  /**
   * Envío optimista: cada mensaje aparece al instante y se confirma (o queda con error para
   * reintentar) al responder el servidor. Cada archivo va en su propio mensaje, en orden; el texto
   * va con el primero. Una directa nueva se crea con el primero y los demás ya van a ella.
   */
  async function enviar(texto: string, archivos: File[] = []) {
    let clave = claveHilo(vista);
    if (!clave) return;
    let destino: DestinoMensaje = vista.tipo === "conversacion" ? { conversacionId: vista.id } : { para: vista.tipo === "borrador" ? vista.para.id : "" };
    const lista: Envio[] = archivos.length > 0 ? archivos.map((archivo, i) => ({ texto: i === 0 ? texto : "", archivo })) : [{ texto, archivo: null }];

    const temporales: MensajeUI[] = lista.map((e) => {
      const tipo = e.archivo ? (tipoDeAdjunto(e.archivo.name, e.archivo.type) ?? "") : "";
      const previa = e.archivo && esImagen(tipo) ? URL.createObjectURL(e.archivo) : null;
      const id = `tmp-${crypto.randomUUID()}`;
      envios.current.set(id, { ...e, previa });
      return {
        id,
        autorId: usuarioId,
        autor: "",
        texto: e.texto,
        at: new Date().toISOString(),
        eliminado: false,
        estado: "enviando",
        ...(e.archivo && { progreso: 0 }),
        adjunto: e.archivo ? { nombre: e.archivo.name, tipo, bytes: e.archivo.size, ancho: null, alto: null, url: previa ?? "" } : null,
      };
    });
    const inicial = clave;
    setHilos((h) => ({
      ...h,
      [inicial]: {
        mensajes: h[inicial]?.mensajes ?? [],
        hayMas: h[inicial]?.hayMas ?? false,
        pendientes: [...(h[inicial]?.pendientes ?? []), ...temporales],
      },
    }));

    for (const [i, envio] of lista.entries()) {
      const temporal = temporales[i];
      const actual = clave;
      const fallo = (error: string) => cambiarPendiente(actual, temporal.id, { estado: "error", error, progreso: undefined });

      let adjunto: AdjuntoEnviado | undefined;
      if (envio.archivo) {
        const preparada = await prepararImagen(envio.archivo, temporal.adjunto?.tipo ?? "");
        const p = await prepararAdjunto(destino, { tipo: preparada.tipo, bytes: preparada.archivo.size });
        if (!p.ok) {
          fallo(p.error);
          continue;
        }
        const subido = await subirConProgreso(p.url, p.headers, preparada.archivo, (avance) =>
          cambiarPendiente(actual, temporal.id, { progreso: avance })
        );
        if (!subido) {
          fallo(navigator.onLine ? "No se pudo subir el archivo" : "Sin conexión");
          continue;
        }
        adjunto = {
          clave: p.clave,
          nombre: envio.archivo.name,
          tipo: preparada.tipo,
          ...(preparada.ancho && { ancho: preparada.ancho }),
          ...(preparada.alto && { alto: preparada.alto }),
        };
      }

      const r = await enviarMensaje({ ...destino, texto: envio.texto, ...(adjunto && { adjunto }) });
      if (!r.ok) {
        fallo(r.error);
        continue;
      }
      soltarEnvio(temporal.id);
      const confirmado = r.conversacionId;
      setHilos((h) => {
        const { [actual]: previo, ...resto } = h;
        const base = actual === confirmado ? previo : (resto[confirmado] ?? previo);
        return {
          ...resto,
          [confirmado]: {
            mensajes: unirMensajes(base?.mensajes ?? [], [r.mensaje]),
            // Los que siguen (si los hay) se mudan con la conversación.
            pendientes: [...(actual === confirmado ? [] : (resto[confirmado]?.pendientes ?? [])), ...(previo?.pendientes ?? [])].filter(
              (p) => p.id !== temporal.id
            ),
            hayMas: base?.hayMas ?? false,
          },
        };
      });
      // La directa nueva ya existe: la vista y los envíos que siguen pasan a ella.
      if (destino.para) {
        setVista((v) => (v.tipo === "borrador" && v.para.id === destino.para ? { tipo: "conversacion", id: confirmado } : v));
        destino = { conversacionId: confirmado };
      }
      clave = confirmado;
    }
    refrescar();
  }

  function reintentar(m: MensajeUI) {
    const clave = claveHilo(vista);
    const envio = envios.current.get(m.id);
    if (!clave || !envio) return;
    soltarEnvio(m.id);
    setHilos((h) => (h[clave] ? { ...h, [clave]: { ...h[clave], pendientes: h[clave].pendientes.filter((p) => p.id !== m.id) } } : h));
    void enviar(envio.texto, envio.archivo ? [envio.archivo] : []);
  }

  async function eliminar(m: MensajeChat) {
    if (vista.tipo !== "conversacion") return;
    const id = vista.id;
    const marcar = (eliminado: boolean, texto: string, adjunto: MensajeChat["adjunto"]) =>
      setHilos((h) =>
        h[id] ? { ...h, [id]: { ...h[id], mensajes: h[id].mensajes.map((x) => (x.id === m.id ? { ...x, eliminado, texto, adjunto } : x)) } } : h
      );
    marcar(true, "", null);
    const r = await eliminarMensaje(m.id);
    if (!r.ok) {
      marcar(false, m.texto, m.adjunto);
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
  const desactivada = Boolean(conversacion?.otro && !conversacion.otro.activo);
  // Se puede escribir (y soltar archivos) en una conversación abierta con alguien activo.
  const escribe = (vista.tipo === "conversacion" || vista.tipo === "borrador") && !desactivada;

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
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-md"
        // Soltar archivos en cualquier parte de la conversación los agrega al mensaje.
        onDragOver={(e) => {
          if (escribe && e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!escribe || e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          compositor.current?.agregarArchivos([...e.dataTransfer.files]);
        }}
      >
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
            {desactivada ? (
              <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
                Esta cuenta está desactivada: ya no puede recibir mensajes.
              </p>
            ) : (
              <Compositor
                ref={compositor}
                onEnviar={(t, archivos) => void enviar(t, archivos)}
                placeholder={esEquipo ? "Escribe a todo el equipo…" : `Escribe a ${titulo.split(/\s+/)[0]}…`}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
