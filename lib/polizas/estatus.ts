// Cancelación y endosos de una póliza: catálogos y validación (compartidos por cliente y servidor).
import { parseNumero } from "@/lib/polizas/validacion";

export const MOTIVOS_CANCELACION = [
  "Falta de pago",
  "Solicitud del cliente",
  "Cambio de aseguradora",
  "Pérdida total / siniestro",
  "Venta del bien asegurado",
  "Otro",
] as const;

export const TIPOS_ENDOSO = [
  { value: "aumento_suma", label: "Aumento de suma asegurada" },
  { value: "disminucion_suma", label: "Disminución de suma asegurada" },
  { value: "alta_asegurado", label: "Alta de asegurado" },
  { value: "baja_asegurado", label: "Baja de asegurado" },
  { value: "cambio_cobertura", label: "Cambio de coberturas" },
  { value: "cambio_datos", label: "Cambio de datos" },
  { value: "otro", label: "Otro" },
] as const;
export type TipoEndoso = (typeof TIPOS_ENDOSO)[number]["value"];
export const esTipoEndoso = (v: unknown): v is TipoEndoso =>
  typeof v === "string" && TIPOS_ENDOSO.some((t) => t.value === v);
export const etiquetaEndoso = (tipo: string) => TIPOS_ENDOSO.find((t) => t.value === tipo)?.label ?? tipo;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v: string) =>
  FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

export const MAX_DESCRIPCION_ENDOSO = 1000;
/** Tope absoluto del movimiento de prima de un endoso (cobro o devolución). */
export const MAX_PRIMA_ENDOSO = 100_000_000;

export type EndosoValores = { tipo: string; fecha: string; numero: string; descripcion: string; prima: string };
export type ErroresEndoso = Partial<Record<keyof EndosoValores, string>>;

/**
 * Valida un endoso. La prima es opcional y admite signo: positiva = cobro adicional, negativa =
 * devolución ("-1,250.00"). La fecha debe caer dentro de la vigencia de la póliza.
 */
export function validarEndoso(e: EndosoValores, vigencia: { inicio: string; fin: string }): ErroresEndoso {
  const errores: ErroresEndoso = {};
  if (!esTipoEndoso(e.tipo)) errores.tipo = "Elige el tipo de endoso.";
  if (!fechaValida(e.fecha)) errores.fecha = "Fecha inválida.";
  else if (e.fecha < vigencia.inicio || e.fecha > vigencia.fin) errores.fecha = "Debe caer dentro de la vigencia de la póliza.";
  if (e.numero.trim().length > 60) errores.numero = "Máximo 60 caracteres.";
  const descripcion = e.descripcion.trim();
  if (!descripcion) errores.descripcion = "Describe el cambio.";
  else if (descripcion.length > MAX_DESCRIPCION_ENDOSO) errores.descripcion = `Máximo ${MAX_DESCRIPCION_ENDOSO} caracteres.`;
  if (e.prima.trim()) {
    const n = primaEndoso(e.prima);
    if (n === null) errores.prima = "Escribe un monto válido (negativo si es devolución).";
    else if (Math.abs(n) > MAX_PRIMA_ENDOSO) errores.prima = "El monto es demasiado grande.";
  }
  return errores;
}

/** Monto de prima de un endoso con signo y dos decimales, o null si no es válido. Vacío = sin prima. */
export function primaEndoso(v: string): number | null {
  const texto = v.trim();
  if (!texto) return null;
  const negativo = /^-|^\(.*\)$/.test(texto);
  const n = parseNumero(texto.replace(/^-|[()]/g, ""));
  if (!Number.isFinite(n) || Math.round(n * 100) / 100 !== n) return null;
  return negativo ? -n : n;
}

/** Fecha de cancelación válida: dentro de la vigencia (o el mismo día en que termina). */
export function validarFechaCancelacion(fecha: string, vigencia: { inicio: string; fin: string }): string | null {
  if (!fechaValida(fecha)) return "Fecha inválida.";
  if (fecha < vigencia.inicio || fecha > vigencia.fin) return "Debe caer dentro de la vigencia de la póliza.";
  return null;
}
