"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, CalendarClock, FileSearch, Loader2, Maximize2, MessageSquareText, RotateCcw, Wallet } from "lucide-react";

import { estadoPersonaje, nuevaConversacion, preguntar, useConversacion } from "@/components/asistente/conversacion";
import { Personaje } from "@/components/asistente/personaje";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CARACTERES_MENSAJE } from "@/lib/asistente/types";
import { cn } from "@/lib/utils";

const SUGERENCIAS = [
  { icono: Wallet, texto: "¿Qué recibos están vencidos y a quién debo llamar primero?" },
  { icono: CalendarClock, texto: "¿Qué pólizas vencen en los próximos 30 días?" },
  { icono: FileSearch, texto: "Explícame la diferencia entre deducible y coaseguro en GMM" },
  { icono: MessageSquareText, texto: "Redáctame un WhatsApp para recordarle a un cliente su pago" },
];

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** "Soy Zen" con nombre propio; con el provisional, "Soy tu asistente". */
const comoSeLlama = (asistente: string) => (asistente === "Asistente" ? "tu asistente" : asistente);

/**
 * Chat del asistente de seguros: respuestas en streaming y consultas a la cartera. Se usa en su
 * página (`pagina`) y en el panel flotante que está en todo el CRM (`panel`); los dos muestran la
 * misma conversación.
 */
export function ChatAsistente({
  asistente,
  usuario,
  color,
  variante = "pagina",
  onNavegar,
}: {
  /** Nombre del asistente (ASISTENTE_NOMBRE). */
  asistente: string;
  usuario: string | null;
  /** Color de marca de la agencia, para el personaje en 3D. */
  color: string;
  variante?: "pagina" | "panel";
  /** Se llama al seguir un enlace de una respuesta (el panel se cierra). */
  onNavegar?: () => void;
}) {
  const reducir = useReducedMotion();
  const conversacion = useConversacion();
  const { mensajes, pensando, consulta } = conversacion;
  const estado = estadoPersonaje(conversacion);
  const [borrador, setBorrador] = React.useState("");
  const finRef = React.useRef<HTMLDivElement>(null);
  const entradaRef = React.useRef<HTMLTextAreaElement>(null);
  const panel = variante === "panel";

  React.useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "end" });
  }, [mensajes, consulta, reducir]);

  // Al terminar una respuesta, el cursor vuelve a la caja de texto.
  React.useEffect(() => {
    if (!pensando) entradaRef.current?.focus();
  }, [pensando]);

  function enviar(texto: string) {
    if (!texto.trim() || pensando) return;
    setBorrador("");
    void preguntar(texto);
  }

  const vacio = mensajes.length === 0;
  const esperandoTexto = pensando && mensajes[mensajes.length - 1]?.rol === "usuario";

  return (
    <div className={cn("flex w-full flex-col", panel ? "h-full" : "mx-auto h-[calc(100svh-8.5rem)] max-w-3xl")}>
      <div className={cn("flex items-center justify-between gap-3", panel ? "border-b px-4 py-3 pr-12" : "pb-4")}>
        <div className="flex min-w-0 items-center gap-3">
          {/* Con la conversación vacía el personaje está grande al centro; aquí, cuando ya hay mensajes. */}
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-card">
            {vacio ? (
              <span className="size-2 rounded-full bg-primary" />
            ) : (
              <Personaje estado={estado} color={color} className="size-11" />
            )}
          </div>
          <div className="min-w-0">
            {panel ? (
              <p className="truncate font-semibold tracking-tight">{asistente}</p>
            ) : (
              <h1 className="truncate text-lg font-semibold tracking-tight">{asistente}</h1>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {estado === "pensando" ? "Pensando…" : estado === "hablando" ? "Escribiendo…" : "Tu asistente de seguros"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!vacio && (
            <Button
              variant="outline"
              size={panel ? "icon-sm" : "sm"}
              onClick={nuevaConversacion}
              disabled={pensando}
              aria-label="Nueva conversación"
              title="Nueva conversación"
            >
              <RotateCcw /> {!panel && "Nueva conversación"}
            </Button>
          )}
          {panel && (
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/asistente" onClick={onNavegar} aria-label="Abrir en pantalla completa" title="Abrir en pantalla completa">
                <Maximize2 />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn("min-h-0 flex-1 overflow-y-auto", panel ? "px-4 py-4" : "rounded-2xl border bg-card/60 p-4 sm:p-6")}
        aria-live="polite"
      >
        {vacio ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-5 text-center">
            <motion.div
              initial={reducir ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", visualDuration: 0.5, bounce: 0.3 }}
            >
              <Personaje estado={estado} color={color} className={panel ? "size-28" : "size-36"} />
            </motion.div>
            <motion.div
              initial={reducir ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            >
              <p className="text-xl font-semibold tracking-tight">
                Hola{usuario ? `, ${usuario.split(" ")[0]}` : ""}. Soy {comoSeLlama(asistente)}.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pregúntame de seguros o de tu cartera: pólizas, clientes, recibos y renovaciones.
              </p>
            </motion.div>
            <div className={cn("grid w-full gap-2.5", !panel && "sm:grid-cols-2")}>
              {SUGERENCIAS.map((s, i) => (
                <motion.button
                  key={s.texto}
                  type="button"
                  onClick={() => enviar(s.texto)}
                  initial={reducir ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.05, duration: 0.3, ease: EASE_OUT }}
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
                  transition={{ duration: 0.25, ease: EASE_OUT }}
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
                    {m.rol === "usuario" ? (
                      <p className="whitespace-pre-wrap">{m.texto}</p>
                    ) : (
                      <TextoMarkdown texto={m.texto} onNavegar={onNavegar} />
                    )}
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

      <div className={cn(panel && "border-t px-3 pt-3 pb-2")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(borrador);
          }}
          className={cn(
            "flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-primary/50 focus-within:shadow-md focus-within:shadow-primary/10",
            !panel && "mt-3"
          )}
        >
          <Textarea
            ref={entradaRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviar(borrador);
              }
            }}
            placeholder={
              panel
                ? `Pregúntale a ${comoSeLlama(asistente)}…`
                : "Escribe tu pregunta… (Enter para enviar, Shift+Enter para otra línea)"
            }
            rows={1}
            maxLength={MAX_CARACTERES_MENSAJE}
            aria-label={`Pregunta para ${comoSeLlama(asistente)}`}
            className="max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button type="submit" size="icon" disabled={pensando || !borrador.trim()} aria-label="Enviar" className="rounded-xl">
            {pensando ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          La IA puede equivocarse: confirma coberturas y montos en la póliza o con la aseguradora.
        </p>
      </div>
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
 * Markdown mínimo de las respuestas: párrafos, listas con "- " o "1." (con un nivel de sangría
 * para los puntos anidados), **negritas** y enlaces
 * internos [texto](/ruta). Los enlaces externos se muestran como texto: el asistente solo enlaza
 * pantallas del CRM.
 */
function TextoMarkdown({ texto, onNavegar }: { texto: string; onNavegar?: () => void }) {
  const bloques: React.ReactNode[] = [];
  let lista: { ordenada: boolean; items: { texto: string; anidado: boolean }[] } | null = null;
  const cerrarLista = () => {
    if (!lista) return;
    const Tag = lista.ordenada ? "ol" : "ul";
    bloques.push(
      <Tag key={bloques.length} className={cn("space-y-1 pl-5", lista.ordenada ? "list-decimal" : "list-disc")}>
        {lista.items.map((item, i) => (
          <li key={i} className={cn(item.anidado && "ml-5 list-[circle] text-foreground/90")}>
            {enLinea(item.texto, onNavegar)}
          </li>
        ))}
      </Tag>
    );
    lista = null;
  };
  for (const linea of texto.split("\n")) {
    const vineta = /^(\s*)[-*•]\s+(.*)$/.exec(linea);
    const numero = /^(\s*)\d+[.)]\s+(.*)$/.exec(linea);
    const item = vineta ?? numero;
    if (item) {
      // Con sangría es un punto dentro del anterior: se queda en la misma lista, un nivel adentro.
      const anidado = lista !== null && item[1].length >= 2;
      const ordenada = Boolean(numero);
      if (lista && !anidado && lista.ordenada !== ordenada) cerrarLista();
      lista ??= { ordenada, items: [] };
      lista.items.push({ texto: item[2], anidado });
      continue;
    }
    cerrarLista();
    if (!linea.trim()) continue;
    const titulo = /^#{1,4}\s+(.*)$/.exec(linea);
    bloques.push(
      <p key={bloques.length} className={cn(titulo && "font-semibold")}>
        {enLinea(titulo ? titulo[1] : linea, onNavegar)}
      </p>
    );
  }
  cerrarLista();
  return <div className="space-y-2 break-words">{bloques}</div>;
}

function enLinea(texto: string, onNavegar?: () => void): React.ReactNode[] {
  const partes: React.ReactNode[] = [];
  const patron = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(patron)) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1] !== undefined) partes.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[3].startsWith("/") && !m[3].startsWith("//")) {
      partes.push(
        <Link key={m.index} href={m[3]} onClick={onNavegar} className="font-medium text-primary underline-offset-4 hover:underline">
          {m[2]}
        </Link>
      );
    } else partes.push(m[2]);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}
