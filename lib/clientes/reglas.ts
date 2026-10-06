// Reglas del expediente del cliente (compartidas por cliente y servidor; funciones puras).
import { fechaNacimientoDeRfc } from "@/lib/polizas/asegurados";
import { normalizarRfc, normalizarTelefono, rfcValido } from "@/lib/polizas/validacion";

/** Tipos de registro del seguimiento del cliente. */
export const TIPOS_SEGUIMIENTO = [
  { value: "nota", label: "Nota" },
  { value: "llamada", label: "Llamada" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "correo", label: "Correo" },
  { value: "reunion", label: "Reunión" },
] as const;
export type TipoSeguimiento = (typeof TIPOS_SEGUIMIENTO)[number]["value"];
export const esTipoSeguimiento = (v: unknown): v is TipoSeguimiento =>
  typeof v === "string" && TIPOS_SEGUIMIENTO.some((t) => t.value === v);
export const MAX_TEXTO_SEGUIMIENTO = 2000;

export type ClienteValores = {
  nombre: string;
  rfc: string;
  telefono: string;
  email: string;
  tipoPersona: string;
  fechaNacimiento: string;
  direccion: string;
  municipio: string;
  estado: string;
  codigoPostal: string;
};
export type ErroresCliente = Partial<Record<keyof ClienteValores, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida el formulario del expediente (el nombre y el RFC son obligatorios; lo demás, opcional). */
export function validarCliente(v: ClienteValores, hoy: string): ErroresCliente {
  const e: ErroresCliente = {};
  const nombre = v.nombre.trim();
  if (nombre.length < 2) e.nombre = "Escribe el nombre o razón social.";
  else if (nombre.length > 200) e.nombre = "Máximo 200 caracteres.";
  if (!rfcValido(v.rfc)) e.rfc = "RFC con formato inválido.";
  if (v.telefono.trim() && normalizarTelefono(v.telefono).length !== 10) e.telefono = "Debe tener 10 dígitos.";
  if (v.email.trim() && (!EMAIL.test(v.email.trim()) || v.email.trim().length > 254)) e.email = "Correo con formato inválido.";
  if (!esTipoPersona(v.tipoPersona)) e.tipoPersona = "Elige el tipo de persona.";
  if (v.fechaNacimiento) {
    const valida = FECHA.test(v.fechaNacimiento) && new Date(`${v.fechaNacimiento}T00:00:00Z`).toISOString().startsWith(v.fechaNacimiento);
    if (!valida) e.fechaNacimiento = "Fecha inválida.";
    else if (v.fechaNacimiento > hoy || v.fechaNacimiento < "1900-01-01") e.fechaNacimiento = "Fecha fuera de rango.";
  }
  if (v.direccion.length > 300) e.direccion = "Máximo 300 caracteres.";
  if (v.municipio.length > 120) e.municipio = "Máximo 120 caracteres.";
  if (v.estado.length > 60) e.estado = "Máximo 60 caracteres.";
  if (v.codigoPostal.trim() && !/^\d{5}$/.test(v.codigoPostal.trim())) e.codigoPostal = "Debe tener 5 dígitos.";
  return e;
}

/**
 * ¿Pueden ser la misma persona? Mismo RFC (que no sea genérico), los primeros 10 caracteres del
 * RFC (nombre y fecha; cambia la homoclave por un error de captura) o el mismo nombre normalizado.
 */
export function posiblesDuplicados(
  a: { nombre: string; rfc: string },
  b: { nombre: string; rfc: string }
): boolean {
  const ra = normalizarRfc(a.rfc);
  const rb = normalizarRfc(b.rfc);
  const genericos = RFC_GENERICOS.has(ra) || RFC_GENERICOS.has(rb);
  if (!genericos && ra.length >= 12 && rb.length >= 12) {
    if (ra === rb) return true;
    if (ra.length === rb.length && ra.slice(0, ra.length - 3) === rb.slice(0, rb.length - 3)) return true;
  }
  return claveNombre(a.nombre) !== "" && claveNombre(a.nombre) === claveNombre(b.nombre);
}

export const TIPOS_PERSONA = [
  { value: "FISICA", label: "Persona física" },
  { value: "MORAL", label: "Persona moral" },
] as const;
export type TipoPersonaCliente = (typeof TIPOS_PERSONA)[number]["value"];
export const esTipoPersona = (v: unknown): v is TipoPersonaCliente =>
  typeof v === "string" && TIPOS_PERSONA.some((t) => t.value === v);

/** RFC genéricos del SAT: compartidos por muchas personas, no identifican al cliente. */
export const RFC_GENERICOS: ReadonlySet<string> = new Set(["XAXX010101000", "XEXX010101000"]);

/** El RFC de una persona moral tiene 12 caracteres; el de una física, 13. */
export const tipoPersonaDeRfc = (rfc: string): TipoPersonaCliente =>
  normalizarRfc(rfc).length === 12 ? "MORAL" : "FISICA";

/**
 * Fecha de nacimiento del cliente (YYYY-MM-DD): la capturada o, en una persona física con RFC
 * propio, la que trae el RFC. null si no hay forma de saberla.
 */
export function fechaNacimientoCliente(
  c: { fechaNacimiento: string | null; rfc: string; tipoPersona: TipoPersonaCliente },
  hoy: string
): { fecha: string; origen: "capturada" | "rfc" } | null {
  if (c.fechaNacimiento) return { fecha: c.fechaNacimiento, origen: "capturada" };
  const rfc = normalizarRfc(c.rfc);
  if (c.tipoPersona !== "FISICA" || RFC_GENERICOS.has(rfc)) return null;
  const fecha = fechaNacimientoDeRfc(rfc, hoy);
  return fecha ? { fecha, origen: "rfc" } : null;
}

/** Días que faltan para el próximo cumpleaños (0 = hoy), con el 29 de febrero el 28 en años no bisiestos. */
export function diasParaCumpleanos(nacimiento: string, hoy: string): number {
  const [, mes, dia] = nacimiento.split("-").map(Number);
  const [anio] = hoy.split("-").map(Number);
  const hoyMs = Date.parse(`${hoy}T00:00:00Z`);
  for (const a of [anio, anio + 1]) {
    const ultimo = new Date(Date.UTC(a, mes, 0)).getUTCDate();
    const fecha = Date.UTC(a, mes - 1, Math.min(dia, ultimo));
    if (fecha >= hoyMs) return Math.round((fecha - hoyMs) / 86_400_000);
  }
  return 365;
}

/** Nombre comparable: sin acentos, mayúsculas, signos ni espacios dobles. */
export const claveNombre = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
