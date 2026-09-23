// Validación compartida por el formulario (cliente) y la Server Action (servidor).
import {
  camposGenerales,
  FORMAS_PAGO,
  RAMOS,
  seccionesPorRamo,
  type CampoDef,
  type Ramo,
} from "@/lib/polizas/ramos";

export type Valores = Record<string, string>;
export type Errores = Record<string, string>;

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ANIOS_VIGENCIA = 30;

export const normalizarRfc = (v: string) => v.replace(/[\s-]/g, "").toUpperCase();
export const normalizarTelefono = (v: string) => v.replace(/\D/g, "");

/** Acepta "48,320.40", "$ 48320.4", etc. Devuelve NaN si no es numérico. */
export function parseNumero(v: string): number {
  const limpio = v.replace(/[$,\s]/g, "");
  return limpio === "" ? NaN : Number(limpio);
}

function esFechaValida(v: string) {
  if (!FECHA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

export function validarCampo(campo: CampoDef, valor: string | undefined): string | null {
  const v = valor?.trim() ?? "";
  if (!v) return campo.required ? "Campo obligatorio" : null;

  switch (campo.type) {
    case "number":
    case "currency":
    case "percent": {
      const n = parseNumero(v);
      if (!Number.isFinite(n) || n < 0) return "Ingresa un número válido";
      if (campo.type === "percent" && n > 100) return "Debe estar entre 0 y 100";
      if (campo.type === "currency" && Math.round(n * 100) / 100 !== n) return "Máximo dos decimales";
      break;
    }
    case "date":
      if (!esFechaValida(v)) return "Fecha inválida";
      break;
    case "email":
      if (!EMAIL.test(v)) return "Correo con formato inválido";
      break;
    case "tel":
      if (normalizarTelefono(v).length !== 10) return "Debe tener 10 dígitos";
      break;
    case "select":
      if (campo.options?.length) {
        const valores = campo.options.map((o) => (typeof o === "string" ? o : o.value));
        if (!valores.includes(v)) return "Selecciona una opción válida";
      }
      break;
  }

  if (campo.name === "serie" && v.length !== 17) return "El VIN debe tener 17 caracteres";
  if ((campo.name === "rfc" || campo.name === "rfcCliente") && !RFC.test(normalizarRfc(v))) {
    return "RFC con formato inválido";
  }
  return null;
}

export function validarPoliza(
  ramo: Ramo,
  generales: Valores,
  especificos: Valores,
  aseguradoraIds: readonly string[]
): Errores {
  const errores: Errores = {};

  for (const campo of camposGenerales) {
    const def = campo.name === "aseguradora" ? { ...campo, options: aseguradoraIds } : campo;
    const e = validarCampo(def, generales[campo.name]);
    if (e) errores[campo.name] = e;
  }
  for (const seccion of seccionesPorRamo[ramo]) {
    for (const campo of seccion.campos) {
      const e = validarCampo(campo, especificos[campo.name]);
      if (e) errores[campo.name] = e;
    }
  }

  const { vigenciaInicio: ini, vigenciaFin: fin, primaTotal } = generales;
  if (ini && fin && !errores.vigenciaInicio && !errores.vigenciaFin) {
    if (fin <= ini) {
      errores.vigenciaFin = "Debe ser posterior al inicio de vigencia";
    } else if (Number(fin.slice(0, 4)) - Number(ini.slice(0, 4)) > MAX_ANIOS_VIGENCIA) {
      errores.vigenciaFin = `La vigencia no puede exceder ${MAX_ANIOS_VIGENCIA} años`;
    }
  }
  if (primaTotal && !errores.primaTotal && parseNumero(primaTotal) <= 0) {
    errores.primaTotal = "Debe ser mayor a cero";
  }

  return errores;
}

export type PolizaInput = { ramo: Ramo; generales: Valores; especificos: Valores };

/**
 * Normaliza un payload no confiable: solo conserva los campos definidos,
 * como strings recortados. Devuelve null si la forma es inválida.
 */
export function sanitizarPolizaInput(raw: unknown): PolizaInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { ramo, generales, especificos } = raw as Record<string, unknown>;
  if (typeof ramo !== "string" || !(RAMOS as readonly string[]).includes(ramo)) return null;

  const tomar = (fuente: unknown, campos: CampoDef[]): Valores | null => {
    if (typeof fuente !== "object" || fuente === null) return null;
    const src = fuente as Record<string, unknown>;
    const out: Valores = {};
    for (const { name } of campos) {
      const v = src[name];
      if (v === undefined || v === null) continue;
      if (typeof v !== "string") return null;
      out[name] = v.trim().slice(0, 500);
    }
    return out;
  };

  const r = ramo as Ramo;
  const g = tomar(generales, camposGenerales);
  const e = tomar(especificos, seccionesPorRamo[r].flatMap((s) => s.campos));
  return g && e ? { ramo: r, generales: g, especificos: e } : null;
}

export const mesesPorFormaPago = Object.fromEntries(
  FORMAS_PAGO.map((f) => [f.value, f.meses])
) as Record<(typeof FORMAS_PAGO)[number]["value"], number>;
