"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, CalendarClock, FileSearch, Loader2, MessageSquareText, RotateCcw, Sparkles, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CARACTERES_MENSAJE, type EventoAsistente, type MensajeAsistente } from "@/lib/asistente/types";
import { cn } from "@/lib/utils";

type Mensaje = MensajeAsistente & { id: number; error?: boolean };

const SUGERENCIAS = [
  { icono: Wallet, texto: "¿Qué recibos están vencidos y a quién debo llamar primero?" },
  { icono: CalendarClock, texto: "¿Qué pólizas vencen en los próximos 30 días?" },
  { icono: FileSearch, texto: "Explícame la diferencia entre deducible y coaseguro en GMM" },
  { icono: MessageSquareText, texto: "Redáctame un WhatsApp para recordarle a un cliente su pago" },
];

/**
 * La conversación sobrevive a la navegación dentro del CRM (el módulo sigue cargado) y se pierde
 * al recargar la página: no se guarda nada con datos de clientes en el navegador.
 */
let conversacion: Mensaje[] = [];

/** Asistente de seguros: chat con respuestas en streaming y consultas a la cartera. */
export function ChatAsistente({ nombre }: { nombre: string | null }) {
  const reducir = useReducedMotion();
  const [mensajes, setMensajes] = React.useState<Mensaje[]>(() => conversacion);
  const [borrador, setBorrador] = React.useState("");
  const [pensando, setPensando] = React.useState(false);
  const [consulta, setConsulta] = React.useState<string | null>(null);
  const finRef = React.useRef<HTMLDivElement>(null);
  const entradaRef = React.useRef<HTMLTextAreaElement>(null);
  const siguienteId = React.useRef(conversacion.reduce((m, x) => Math.max(m, x.id), 0) + 1);

  React.useEffect(() => {
    conversacion = mensajes.slice(-40);
  }, [mensajes]);

  React.useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "end" });
  }, [mensajes, consulta, reducir]);

  async function preguntar(texto: string) {
    const pregunta = texto.trim().slice(0, MAX_CARACTERES_MENSAJE);
    if (!pregunta || pensando) return;
    const nueva: Mensaje = { id: siguienteId.current++, rol: "usuario", texto: pregunta };
    const respuestaId = siguienteId.current++;
    const historial = [...mensajes.filter((m) => !m.error), nueva];
    setMensajes([...mensajes, nueva]);
    setBorrador("");
    setPensando(true);
    setConsulta(null);

    const agregarTexto = (fragmento: string) =>
      setMensajes((actuales) => {
        const existe = actuales.some((m) => m.id === respuestaId);
        return existe
          ? actuales.map((m) => (m.id === respuestaId ? { ...m, texto: m.texto + fragmento } : m))
          : [...actuales, { id: respuestaId, rol: "asistente", texto: fragmento }];
      });
    const fallar = (error: string) =>
      setMensajes((actuales) => [
        ...actuales.filter((m) => m.id !== respuestaId || m.texto),
        { id: siguienteId.current++, rol: "asistente", texto: error, error: true },
      ]);

    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: historial.map(({ rol, texto }) => ({ rol, texto })) }),
      });
      if (!res.ok || !res.body) {
        const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
        fallar(cuerpo?.error ?? "No pude responder en este momento. Intenta de nuevo.");
        return;
      }
      const lector = res.body.getReader();
      const decoder = new TextDecoder();
      let pendiente = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += decoder.decode(value, { stream: true });
        const lineas = pendiente.split("\n");
        pendiente = lineas.pop() ?? "";
        for (const linea of lineas) {
          if (!linea.trim()) continue;
          const evento = JSON.parse(linea) as EventoAsistente;
          if (evento.tipo === "texto") {
            setConsulta(null);
            agregarTexto(evento.texto);
          } else if (evento.tipo === "herramienta") setConsulta(evento.etiqueta);
          else if (evento.tipo === "error") fallar(evento.error);
        }
      }
    } catch {
      fallar("Se perdió la conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPensando(false);
      setConsulta(null);
      entradaRef.current?.focus();
    }
  }

  function nuevaConversacion() {
    setMensajes([]);
    entradaRef.current?.focus();
  }

  const vacio = mensajes.length === 0;
  const esperandoTexto = pensando && mensajes[mensajes.length - 1]?.rol === "usuario";

  return (
    <div className="mx-auto flex h-[calc(100svh-8.5rem)] w-full max-w-3xl flex-col">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <span className="relative grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg shadow-primary/25">
            <Sparkles className="size-5" />
            {!reducir && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-xl ring-2 ring-primary/40"
                animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Asistente de seguros</h1>
            <p className="text-xs text-muted-foreground">Dudas de seguros y consultas a tu cartera, al instante.</p>
          </div>
        </div>
        {!vacio && (
          <Button variant="outline" size="sm" onClick={nuevaConversacion} disabled={pensando}>
            <RotateCcw /> Nueva conversación
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border bg-card/60 p-4 sm:p-6" aria-live="polite">
        {vacio ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <motion.div
              initial={reducir ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-xl font-semibold tracking-tight">Hola{nombre ? `, ${nombre.split(" ")[0]}` : ""}. ¿En qué te ayudo?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pregúntame de seguros o de tu cartera: pólizas, clientes, recibos y renovaciones.
              </p>
            </motion.div>
            <div className="grid w-full gap-2.5 sm:grid-cols-2">
              {SUGERENCIAS.map((s, i) => (
                <motion.button
                  key={s.texto}
                  type="button"
                  onClick={() => preguntar(s.texto)}
                  initial={reducir ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={reducir ? undefined : { y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="group flex items-start gap-3 rounded-xl border bg-background p-3.5 text-left text-sm shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-primary/50 hover:shadow-md hover:shadow-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
                    <s.icono className="size-4" />
                  </span>
                  <span className="pt-1 leading-snug">{s.texto}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {mensajes.map((m) => (
                <motion.div
                  key={m.id}
                  initial={reducir ? false : { opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("flex", m.rol === "usuario" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      m.rol === "usuario"
                        ? "rounded-br-md bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : m.error
                          ? "rounded-bl-md border border-destructive/40 bg-destructive/10 text-destructive"
                          : "rounded-bl-md border bg-background"
                    )}
                  >
                    {m.rol === "usuario" ? <p className="whitespace-pre-wrap">{m.texto}</p> : <TextoMarkdown texto={m.texto} />}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <AnimatePresence>
              {(esperandoTexto || consulta) && (
                <motion.div
                  key="pensando"
                  initial={reducir ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {consulta ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary">
                      <Loader2 className="size-3 animate-spin" /> {consulta}…
                    </span>
                  ) : (
                    <Escribiendo />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void preguntar(borrador);
        }}
        className="mt-3 flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-primary/50 focus-within:shadow-md focus-within:shadow-primary/10"
      >
        <Textarea
          ref={entradaRef}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void preguntar(borrador);
            }
          }}
          placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para otra línea)"
          rows={1}
          maxLength={MAX_CARACTERES_MENSAJE}
          aria-label="Pregunta para el asistente"
          className="max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="submit"
          size="icon"
          disabled={pensando || !borrador.trim()}
          aria-label="Enviar"
          className="rounded-xl shadow-md shadow-primary/25"
        >
          {pensando ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        La IA puede equivocarse: confirma coberturas y montos en la póliza o con la aseguradora.
      </p>
    </div>
  );
}

/** Tres puntos que laten mientras llega la respuesta. */
function Escribiendo() {
  const reducir = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-2" aria-label="El asistente está escribiendo">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-primary"
          animate={reducir ? undefined : { y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/**
 * Markdown mínimo de las respuestas: párrafos, listas con "- " o "1.", **negritas** y enlaces
 * internos [texto](/ruta). Los enlaces externos se muestran como texto: el asistente solo enlaza
 * pantallas del CRM.
 */
function TextoMarkdown({ texto }: { texto: string }) {
  const bloques: React.ReactNode[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;
  const cerrarLista = () => {
    if (!lista) return;
    const Tag = lista.ordenada ? "ol" : "ul";
    bloques.push(
      <Tag key={bloques.length} className={cn("space-y-1 pl-5", lista.ordenada ? "list-decimal" : "list-disc")}>
        {lista.items.map((item, i) => (
          <li key={i}>{enLinea(item)}</li>
        ))}
      </Tag>
    );
    lista = null;
  };
  for (const linea of texto.split("\n")) {
    const vineta = /^\s*[-*•]\s+(.*)$/.exec(linea);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    if (vineta || numero) {
      const ordenada = Boolean(numero);
      if (lista && lista.ordenada !== ordenada) cerrarLista();
      lista ??= { ordenada, items: [] };
      lista.items.push((vineta ?? numero)![1]);
      continue;
    }
    cerrarLista();
    if (!linea.trim()) continue;
    const titulo = /^#{1,4}\s+(.*)$/.exec(linea);
    bloques.push(
      <p key={bloques.length} className={cn(titulo && "font-semibold")}>
        {enLinea(titulo ? titulo[1] : linea)}
      </p>
    );
  }
  cerrarLista();
  return <div className="space-y-2 break-words">{bloques}</div>;
}

function enLinea(texto: string): React.ReactNode[] {
  const partes: React.ReactNode[] = [];
  const patron = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(patron)) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1] !== undefined) partes.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[3].startsWith("/") && !m[3].startsWith("//")) {
      partes.push(
        <Link key={m.index} href={m[3]} className="font-medium text-primary underline-offset-4 hover:underline">
          {m[2]}
        </Link>
      );
    } else partes.push(m[2]);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}
