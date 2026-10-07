// Tipos, límites y plantilla HTML de los correos a clientes.
// Se usa en el servidor (envío) y en el cliente (vista previa), así que no importa nada de servidor.

import { COLOR_MARCA_PREDETERMINADO, esTema, FONDO_TEMA, TEMA_PREDETERMINADO } from "@/lib/agencias/marca";
import { contraste, normalizarHex } from "@/lib/color";

/** Máximo de destinatarios por envío: cada correo es individual y Resend limita ~2 solicitudes/s. */
export const MAX_DESTINATARIOS = 400;
export const MAX_ASUNTO = 200;
/** Límite por imagen insertada en el cuerpo (se envían como adjuntos en línea). */
export const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;
/** Límite del cuerpo completo (HTML + imágenes en base64). */
export const MAX_BYTES_CUERPO = 8 * 1024 * 1024;
export const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/gif"] as const;

/** Variable que se sustituye por el nombre de cada cliente. */
export const VARIABLE_NOMBRE = "{{nombre}}";

export type DestinatarioCorreo = { id: string; nombre: string; email: string };

export type EnviarCorreoSolicitud = {
  asunto: string;
  /** HTML producido por el editor. */
  html: string;
  /** `todos` o una lista de IDs de clientes. Se ignora si `prueba` es true. */
  destinatarios: "todos" | string[];
  /** Envía un solo correo de prueba al usuario de la sesión. */
  prueba?: boolean;
};

export type ResultadoEnvio = { email: string; nombre: string; ok: boolean; error?: string };

export type EnviarCorreoRespuesta =
  | { ok: true; enviados: number; fallidos: number; omitidos: number; resultados: ResultadoEnvio[] }
  | { ok: false; error: string };

const ENTIDADES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

/** Sustituye {{nombre}} (con o sin espacios internos) por el nombre del cliente. */
export function personalizar(texto: string, nombre: string, html: boolean) {
  const valor = html ? escaparHtml(nombre) : nombre;
  return texto.replace(/\{\{\s*nombre\s*\}\}/gi, () => valor);
}

/** Quita scripts, manejadores de eventos y URLs `javascript:` del HTML del editor. */
export function limpiarHtml(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/**
 * Estilos en línea: varios clientes de correo (Outlook, Gmail en apps) ignoran las hojas de
 * estilo, así que las reglas básicas se aplican directamente a cada etiqueta.
 */
const ESTILOS_EN_LINEA: Record<string, string> = {
  p: "margin:0 0 14px;",
  h1: "margin:0 0 14px;font-size:24px;line-height:1.3;color:#0a0a0a;",
  h2: "margin:20px 0 12px;font-size:20px;line-height:1.3;color:#0a0a0a;",
  h3: "margin:18px 0 10px;font-size:17px;line-height:1.3;color:#0a0a0a;",
  ul: "margin:0 0 14px;padding-left:24px;",
  ol: "margin:0 0 14px;padding-left:24px;",
  li: "margin:0 0 4px;",
  a: "color:#8c7340;text-decoration:underline;",
  img: "max-width:100%;height:auto;border:0;display:inline-block;",
  hr: "border:0;border-top:1px solid #e4e4e7;margin:22px 0;",
  blockquote: "margin:0 0 14px;padding-left:14px;border-left:3px solid #c5a059;color:#52525b;",
};

function aplicarEstilosEnLinea(html: string, estilos: Record<string, string>) {
  return html.replace(/<(p|h1|h2|h3|ul|ol|li|a|img|hr|blockquote)\b([^>]*)>/gi, (_m, etiqueta: string, attrs: string) => {
    const base = estilos[etiqueta.toLowerCase()];
    const estilo = attrs.match(/\sstyle\s*=\s*"([^"]*)"/i);
    if (estilo) {
      // El estilo propio (alineación, color) va después para que tenga prioridad.
      return `<${etiqueta}${attrs.replace(estilo[0], ` style="${base}${estilo[1]}"`)}>`;
    }
    return `<${etiqueta}${attrs} style="${base}">`;
  });
}

/** Marca de la agencia que envía: su nombre, color, logo y tema visten el correo. */
export type MarcaCorreo = {
  nombre: string;
  colorHex: string | null;
  logoUrl: string | null;
  tema: string;
  /** Correo de servicio de la agencia: se invita al cliente a escribirle y recibe sus respuestas. */
  correoServicio?: string | null;
};

/**
 * Remitente con el nombre de la agencia y la dirección universal de EMAIL_SENDER
 * (`"Nombre" <correo@dominio>` o solo la dirección): todas las agencias envían desde el mismo
 * correo, pero el cliente ve el nombre de la suya.
 */
export function remitenteDeAgencia(remitente: string, agencia: string) {
  const direccion = remitente.match(/<([^>]+)>/)?.[1]?.trim() ?? remitente.trim();
  const nombre = agencia.replace(/["<>\r\n\\]/g, "").trim();
  return nombre ? `"${nombre}" <${direccion}>` : direccion;
}

/** Documento HTML completo del correo: encabezado con la marca de la agencia, cuerpo y pie. */
export function construirCorreoHtml({
  asunto,
  cuerpo,
  marca,
}: {
  asunto: string;
  cuerpo: string;
  marca: MarcaCorreo;
}) {
  const anio = new Date().getFullYear();
  const empresa = marca.nombre;
  const color = normalizarHex(marca.colorHex) ?? COLOR_MARCA_PREDETERMINADO;
  // El encabezado usa el fondo del tema de la agencia: su logo y su color se eligieron para él.
  const fondo = FONDO_TEMA[esTema(marca.tema) ? marca.tema : TEMA_PREDETERMINADO];
  // Sobre el cuerpo blanco un color de marca muy claro no se leería: los enlaces usan el del texto.
  const acento = contraste(color, "#FFFFFF") >= 3 ? color : "#27272a";
  const estilos = {
    ...ESTILOS_EN_LINEA,
    a: `color:${acento};text-decoration:underline;`,
    blockquote: `margin:0 0 14px;padding-left:14px;border-left:3px solid ${color};color:#52525b;`,
  };
  // Solo logos servidos por https (Storage): una ruta relativa de /public no carga en un correo.
  const logo = marca.logoUrl?.startsWith("https://") ? marca.logoUrl : null;
  const titulo = `font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.5px;color:${color};`;
  const servicio = marca.correoServicio?.trim() || null;
  const enlaceServicio = servicio
    ? `<a href="mailto:${escaparHtml(servicio)}" style="color:${acento};text-decoration:underline;">${escaparHtml(servicio)}</a>`
    : "";
  // Al final de todo correo a clientes: a dónde escribir sus dudas.
  const contacto = servicio
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e4e7;font-size:14px;line-height:1.5;color:#52525b;">¿Dudas o aclaraciones? Escríbenos a ${enlaceServicio} y con gusto te atenderemos.</p>`
    : "";
  const encabezado = logo
    ? `<img src="${escaparHtml(logo)}" alt="${escaparHtml(empresa)}" height="44" style="height:44px;width:auto;max-width:260px;border:0;display:block;${titulo}">`
    : `<span style="${titulo}">${escaparHtml(empresa)}</span>`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escaparHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e4e7;">
<tr><td style="background-color:${fondo};padding:20px 32px;border-bottom:3px solid ${color};">
${encabezado}
</td></tr>
<tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#27272a;">
${aplicarEstilosEnLinea(limpiarHtml(cuerpo), estilos)}
${contacto}
</td></tr>
<tr><td style="padding:18px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#71717a;">
Recibes este correo porque eres cliente de ${escaparHtml(empresa)}. ${servicio ? `Si tienes dudas, escríbenos a ${enlaceServicio}.` : "Si tienes dudas, responde directamente a este mensaje."}<br>
&copy; ${anio} ${escaparHtml(empresa)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Versión en texto plano (mejora la entregabilidad y la leen clientes sin HTML). */
export function htmlATexto(html: string) {
  return html
    .replace(/<(head|script|style)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, "[$1]")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, texto: string) =>
      href.startsWith("http") && href !== texto ? `${texto} (${href})` : texto
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(p|h[1-6]|li|div|blockquote|tr)>/gi, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n————\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&copy;/g, "©")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** El editor deja `<p></p>` cuando está vacío. */
export function cuerpoVacio(html: string) {
  return !/<img\b/i.test(html) && htmlATexto(html).length === 0;
}
