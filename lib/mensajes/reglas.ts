// Mensajería interna del equipo: reglas y formas compartidas por el servidor y el navegador.

export const MAX_TEXTO_MENSAJE = 2000;
/** Mensajes por página de una conversación (los más recientes; los anteriores se piden aparte). */
export const MENSAJES_POR_PAGINA = 50;
/** Clave del canal de toda la agencia. */
export const CLAVE_EQUIPO = "equipo";

/** Conversación directa: una sola por pareja, con los ids ordenados. */
export function claveDirecta(a: string, b: string) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return { clave: `dm:${x}:${y}`, usuarioAId: x, usuarioBId: y };
}

/**
 * Texto listo para guardar (sin espacios sobrantes ni saltos de Windows) o el error para el usuario.
 * Con un adjunto, el texto puede ir vacío.
 */
export function validarTextoMensaje(
  raw: unknown,
  { conAdjunto = false }: { conAdjunto?: boolean } = {}
): { ok: true; texto: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Mensaje inválido." };
  const texto = raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!texto && !conAdjunto) return { ok: false, error: "Escribe un mensaje." };
  if (texto.length > MAX_TEXTO_MENSAJE) return { ok: false, error: `Máximo ${MAX_TEXTO_MENSAJE} caracteres.` };
  return { ok: true, texto };
}

/** Archivo o imagen de un mensaje; `url` lo abre (o lo descarga) con la sesión de quien lo pide. */
export type AdjuntoChat = {
  nombre: string;
  tipo: string;
  bytes: number;
  /** Medidas de la imagen, para reservar su lugar mientras carga. */
  ancho: number | null;
  alto: number | null;
  url: string;
};

export type MensajeChat = {
  id: string;
  autorId: string | null;
  /** Nombre del autor; "Usuario eliminado" si ya no existe. */
  autor: string;
  /** Vacío si se eliminó (o si solo lleva un adjunto). */
  texto: string;
  /** ISO. */
  at: string;
  eliminado: boolean;
  adjunto: AdjuntoChat | null;
};

export type ConversacionResumen = {
  id: string;
  tipo: "equipo" | "directa";
  /** "Todo el equipo" o el nombre de la otra persona. */
  titulo: string;
  otro: { id: string; nombre: string; rol: string; activo: boolean } | null;
  ultimo: {
    texto: string;
    autor: string;
    mio: boolean;
    at: string;
    eliminado: boolean;
    adjunto: { tipo: string; nombre: string } | null;
  } | null;
  noLeidos: number;
};

export type MiembroChat = { id: string; nombre: string; rol: string };

export type RespuestaChat =
  | {
      ok: true;
      yo: string;
      noLeidos: number;
      conversaciones: ConversacionResumen[];
      /** Solo si se pidió una conversación: sus mensajes más recientes. */
      abierta?: { id: string; mensajes: MensajeChat[]; hayMas: boolean };
      /** Solo si se pidieron: con quién se puede iniciar una conversación. */
      miembros?: MiembroChat[];
    }
  | { ok: false; error: string };

/** Mismo autor seguido en menos de este lapso: los mensajes se agrupan sin repetir su nombre. */
const AGRUPAR_MS = 5 * 60_000;

export type MensajeEnLista = MensajeChat & {
  /** Primer mensaje de su día: lleva el separador ("Hoy", "Ayer", "3 oct"). */
  dia: string | null;
  /** Empieza un grupo nuevo (otro autor, otro día o pasó un rato): lleva nombre y hora. */
  inicioGrupo: boolean;
};

const fechaDia = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});
const diaIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });

/** "Hoy", "Ayer" o la fecha, según el día (en la zona horaria de la operación). */
export function etiquetaDia(at: string, hoy: string) {
  const dia = diaIso.format(new Date(at));
  if (dia === hoy) return "Hoy";
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (dia === ayer) return "Ayer";
  return fechaDia.format(new Date(at));
}

/** Marca separadores de día y grupos por autor en una lista ordenada del más antiguo al más reciente. */
export function agruparMensajes(mensajes: readonly MensajeChat[], hoy: string): MensajeEnLista[] {
  return mensajes.map((m, i) => {
    const previo = mensajes[i - 1];
    const dia = diaIso.format(new Date(m.at));
    const nuevoDia = !previo || diaIso.format(new Date(previo.at)) !== dia;
    const inicioGrupo =
      nuevoDia ||
      !previo ||
      previo.autorId !== m.autorId ||
      Date.parse(m.at) - Date.parse(previo.at) > AGRUPAR_MS;
    return { ...m, dia: nuevoDia ? etiquetaDia(m.at, hoy) : null, inicioGrupo };
  });
}

/** Une la página reciente que llega en cada sondeo con lo que ya se tenía (anteriores y pendientes de confirmar). */
export function unirMensajes(actuales: readonly MensajeChat[], recientes: readonly MensajeChat[]): MensajeChat[] {
  const porId = new Map(actuales.map((m) => [m.id, m]));
  for (const m of recientes) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** Parte un texto en trozos de texto y enlaces http(s), para mostrarlos sin HTML crudo. */
export function partesConEnlaces(texto: string): { texto: string; enlace: boolean }[] {
  const partes: { texto: string; enlace: boolean }[] = [];
  const patron = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g;
  let ultimo = 0;
  for (const m of texto.matchAll(patron)) {
    if (m.index > ultimo) partes.push({ texto: texto.slice(ultimo, m.index), enlace: false });
    partes.push({ texto: m[0], enlace: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), enlace: false });
  return partes;
}
