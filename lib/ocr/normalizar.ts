// Convierte la salida del modelo en valores listos para el formulario.
// La salida se trata como no confiable: se valida con las mismas reglas del formulario.
import type { ExtraccionPoliza } from "@/lib/ocr/types";
import {
  camposGenerales,
  RAMOS,
  seccionesPorRamo,
  type CampoDef,
  type Ramo,
} from "@/lib/polizas/ramos";
import { normalizarRfc, normalizarTelefono, validarCampo, type Valores } from "@/lib/polizas/validacion";

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function aTexto(campo: CampoDef, valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    return campo.type === "currency" ? valor.toFixed(2) : String(valor);
  }
  if (typeof valor !== "string") return null;
  let v = valor.trim();
  if (!v) return null;
  if (campo.name === "rfcCliente" || campo.name === "rfc") v = normalizarRfc(v);
  if (campo.type === "tel") v = normalizarTelefono(v);
  if (campo.type === "email") v = v.toLowerCase();
  return v.slice(0, 500);
}

function extraerCampos(
  fuente: unknown,
  campos: CampoDef[],
  advertencias: string[]
): Valores {
  const src = typeof fuente === "object" && fuente !== null ? (fuente as Record<string, unknown>) : {};
  const out: Valores = {};

  for (const campo of campos) {
    const v = aTexto(campo, src[campo.name]);
    if (v === null) continue;

    const error = validarCampo(campo, v);
    if (!error) {
      out[campo.name] = v;
    } else if (campo.type === "select" || campo.type === "date") {
      // Un valor fuera de catálogo o una fecha imposible no se puede precargar.
      advertencias.push(`${campo.label}: se descartó el valor detectado "${v}" (${minuscula(error)}).`);
    } else {
      // Se precarga para que el usuario lo corrija; el formulario lo marcará.
      out[campo.name] = v;
      advertencias.push(`${campo.label}: revisa el valor detectado "${v}" (${minuscula(error)}).`);
    }
  }
  return out;
}

export function normalizarExtraccion(raw: unknown, aseguradoras: readonly string[]): ExtraccionPoliza {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const advertencias = Array.isArray(obj.advertencias)
    ? obj.advertencias.filter((a): a is string => typeof a === "string" && a.trim() !== "").map((a) => a.trim().slice(0, 300)).slice(0, 15)
    : [];

  const ramo = typeof obj.ramo === "string" && (RAMOS as readonly string[]).includes(obj.ramo)
    ? (obj.ramo as Ramo)
    : null;

  const generalesDefs = camposGenerales.map((c) =>
    c.name === "aseguradora" ? { ...c, options: aseguradoras } : c
  );
  const generales = extraerCampos(obj.generales, generalesDefs, advertencias);

  const especificos = ramo
    ? extraerCampos(obj.especificos, seccionesPorRamo[ramo].flatMap((s) => s.campos), advertencias)
    : {};

  if (!ramo) advertencias.push("No se pudo determinar el ramo; selecciónalo manualmente.");

  return { ramo, generales, especificos, advertencias };
}
