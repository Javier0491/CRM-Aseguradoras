import OpenAI, { AuthenticationError, PermissionDeniedError, RateLimitError } from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

import { getAgencia } from "@/lib/agencias/queries";
import { ETIQUETA_HERRAMIENTA, HERRAMIENTAS } from "@/lib/asistente/definiciones";
import { ejecutarHerramienta } from "@/lib/asistente/herramientas";
import { construirInstrucciones } from "@/lib/asistente/prompt";
import {
  MAX_CARACTERES_MENSAJE,
  MAX_HISTORIAL,
  type EventoAsistente,
  type MensajeAsistente,
} from "@/lib/asistente/types";
import { alcanceDe } from "@/lib/auth/alcance";
import { getUsuarioCrm } from "@/lib/auth/dal";
import { hoyISO } from "@/lib/format";

// Una respuesta con varias consultas a la cartera puede tardar.
export const maxDuration = 60;

/** Rondas de herramientas por pregunta: evita ciclos si el modelo insiste en consultar. */
const MAX_RONDAS = 5;
const MODELO_PREDETERMINADO = "gpt-4o";

/** Historial recibido del navegador, recortado y validado (no es confiable). */
function leerHistorial(raw: unknown): MensajeAsistente[] | null {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { mensajes?: unknown }).mensajes)) return null;
  const mensajes = (raw as { mensajes: unknown[] }).mensajes
    .filter(
      (m): m is MensajeAsistente =>
        typeof m === "object" &&
        m !== null &&
        ((m as MensajeAsistente).rol === "usuario" || (m as MensajeAsistente).rol === "asistente") &&
        typeof (m as MensajeAsistente).texto === "string" &&
        (m as MensajeAsistente).texto.trim() !== ""
    )
    .slice(-MAX_HISTORIAL)
    .map((m) => ({ rol: m.rol, texto: m.texto.slice(0, MAX_CARACTERES_MENSAJE) }));
  return mensajes.length > 0 && mensajes[mensajes.length - 1].rol === "usuario" ? mensajes : null;
}

function mensajeDeError(e: unknown) {
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) return "La llave de OpenAI es inválida o no tiene permisos.";
  if (e instanceof RateLimitError) return "Se alcanzó el límite de uso de la IA. Intenta en unos minutos.";
  return "No pude responder en este momento. Intenta de nuevo.";
}

export async function POST(req: Request) {
  const user = await getUsuarioCrm();
  if (!user) return Response.json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return Response.json({ error: "El asistente no está configurado (falta OPENAI_API_KEY)." }, { status: 503 });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const historial = leerHistorial(cuerpo);
  if (!historial) return Response.json({ error: "Escribe tu pregunta." }, { status: 400 });

  const agencia = await getAgencia(user.agenciaId);
  const alcance = alcanceDe(user);
  const client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });
  const modelo = process.env.ASISTENTE_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || MODELO_PREDETERMINADO;
  const instrucciones = construirInstrucciones({
    agencia: agencia.nombre,
    usuario: user.nombre,
    hoy: hoyISO(),
    soloSuCartera: user.soloSuCartera,
  });
  const input: ResponseInputItem[] = historial.map((m) => ({
    role: m.rol === "usuario" ? "user" : "assistant",
    content: m.texto,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (evento: EventoAsistente) => controller.enqueue(encoder.encode(`${JSON.stringify(evento)}\n`));
      try {
        for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
          const respuesta = await client.responses.create({
            model: modelo,
            instructions: instrucciones,
            input,
            tools: HERRAMIENTAS.map((h) => ({ ...h, parameters: { ...h.parameters } })),
            // En la última ronda ya no se consulta: se responde con lo que hay.
            tool_choice: ronda === MAX_RONDAS - 1 ? "none" : "auto",
            temperature: 0.3,
            max_output_tokens: 1_500,
            // Las consultas llevan datos de clientes: no se guardan en OpenAI.
            store: false,
            stream: true,
          });
          const llamadas: { call_id: string; name: string; arguments: string }[] = [];
          for await (const evento of respuesta) {
            if (evento.type === "response.output_text.delta") enviar({ tipo: "texto", texto: evento.delta });
            else if (evento.type === "response.output_item.done" && evento.item.type === "function_call") {
              llamadas.push({ call_id: evento.item.call_id, name: evento.item.name, arguments: evento.item.arguments });
            }
          }
          if (llamadas.length === 0) break;
          for (const llamada of llamadas) {
            enviar({ tipo: "herramienta", etiqueta: ETIQUETA_HERRAMIENTA[llamada.name] ?? "Consultando el CRM" });
            const resultado = await ejecutarHerramienta(alcance, llamada.name, llamada.arguments).catch((e: unknown) => {
              console.error("[asistente] herramienta", llamada.name, e);
              return { error: "La consulta falló." };
            });
            input.push(
              { type: "function_call", ...llamada },
              { type: "function_call_output", call_id: llamada.call_id, output: JSON.stringify(resultado) }
            );
          }
        }
        enviar({ tipo: "fin" });
      } catch (e) {
        console.error("[asistente]", e);
        enviar({ tipo: "error", error: mensajeDeError(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
