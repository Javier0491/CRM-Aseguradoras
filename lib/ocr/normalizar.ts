// Convierte la salida del modelo en valores listos para el formulario.
// La salida se trata como no confiable: se valida con las mismas reglas del formulario.
import type { ExtraccionPoliza } from "@/lib/ocr/types";
import {
  camposGenerales,
  RAMOS,
  ramoLabels,
  seccionesPorRamo,
  type CampoDef,
  type Ramo,
} from "@/lib/polizas/ramos";
import { extraerPolizaVigor, extraerPolizaVigorDeReferencia } from "@/lib/polizas/polizaParser";
import { normalizarRfc, normalizarTelefono, validarCampo, type Valores } from "@/lib/polizas/validacion";

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const clave = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[\s_]+/g, " ").trim().toLowerCase();

/** La IA responde con la etiqueta ("Vida Grupo"); se acepta también la clave interna. */
function ramoDesdeEtiqueta(valor: string): Ramo | null {
  const buscado = clave(valor);
  return RAMOS.find((r) => clave(ramoLabels[r]) === buscado || clave(r) === buscado) ?? null;
}

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

  const ramo = typeof obj.ramo === "string" ? ramoDesdeEtiqueta(obj.ramo) : null;
  if (ramo === "otros") {
    advertencias.push('La IA clasificó la póliza como "Otros": confirma el ramo antes de guardar.');
  }

  const generalesDefs = camposGenerales
    .filter((c) => !c.derivado)
    .map((c) => (c.name === "aseguradora" ? { ...c, options: aseguradoras } : c));
  const generales = extraerCampos(obj.generales, generalesDefs, advertencias);
  const referenciaPago =
    typeof obj.referenciaPago === "string" && obj.referenciaPago.trim()
      ? obj.referenciaPago.replace(/\s+/g, "").toUpperCase().slice(0, 60)
      : null;

  // La póliza vigor no la calcula la IA: se deriva en código para el cruce de cobranza.
  // 1) del número impreso; 2) si no hay número, de la referencia de pago.
  if (generales.numeroImpreso) {
    generales.numeroImpreso = generales.numeroImpreso.toUpperCase();
    generales.polizaVigor = extraerPolizaVigor(generales.numeroImpreso);
  } else if (referenciaPago) {
    const vigor = extraerPolizaVigorDeReferencia(referenciaPago);
    if (vigor) {
      generales.polizaVigor = vigor;
      advertencias.push(
        `Póliza vigor ${vigor} calculada de la referencia de pago ${referenciaPago}; verifícala. ` +
          "Captura el número de póliza manualmente."
      );
    } else {
      advertencias.push(
        `La referencia de pago ${referenciaPago} no tiene el formato esperado; captura la póliza vigor manualmente.`
      );
    }
  }

  const especificos = ramo
    ? extraerCampos(obj.especificos, seccionesPorRamo[ramo].flatMap((s) => s.campos), advertencias)
    : {};

  if (!ramo) advertencias.push("No se pudo determinar el ramo; selecciónalo manualmente.");

  return { ramo, generales, especificos, referenciaPago, advertencias };
}
