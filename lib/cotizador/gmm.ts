// Reglas del multicotizador de Gastos Médicos Mayores (GMM): qué datos lleva una solicitud y cómo se
// validan. Sin dependencias del servidor (lo usa el formulario). El robot las cotiza en el portal
// de cada aseguradora igual que las de autos (skill cotizador-robot) y devuelve un
// ResultadoCotizacion de lib/cotizador/reglas.ts.
//
// Los datos son genéricos (sumas y deducibles en pesos, plan por nivel): el robot los acomoda a las
// opciones de cada portal (MetLife maneja la suma asegurada en UMAM, por ejemplo) y anota en los
// avisos cuando no hay una opción igual.

import { FORMAS_PAGO, type FormaPago, type Validacion } from "@/lib/cotizador/reglas";
import { hoyISO } from "@/lib/format";

/** Aseguradoras cuyo cotizador de GMM ya maneja el robot. */
export const ASEGURADORAS_GMM = {
  METLIFE: {
    nombre: "MetLife",
    portal: "https://servicios.metlife.com.mx/wps/myportal/",
  },
} as const;
export type AseguradoraGMM = keyof typeof ASEGURADORAS_GMM;

export const PARENTESCOS = ["TITULAR", "CONYUGE", "HIJO"] as const;
export type Parentesco = (typeof PARENTESCOS)[number];
export const ETIQUETA_PARENTESCO: Record<Parentesco, string> = {
  TITULAR: "Titular",
  CONYUGE: "Cónyuge",
  HIJO: "Hijo(a)",
};

/**
 * Nivel del plan. Cada aseguradora le pone su nombre (MetLife MédicaLife Familiar: Internacional,
 * Ejecutivo, Más, Básico y Práctico, en ese orden); el robot elige el equivalente.
 */
export const NIVELES_PLAN = ["INTERNACIONAL", "ALTO", "MEDIO", "BASICO", "ECONOMICO"] as const;
export type NivelPlan = (typeof NIVELES_PLAN)[number];
export const ETIQUETA_NIVEL: Record<NivelPlan, string> = {
  INTERNACIONAL: "Internacional (cubre en el extranjero)",
  ALTO: "Alto",
  MEDIO: "Medio",
  BASICO: "Básico",
  ECONOMICO: "Económico",
};

/** Coberturas adicionales que se contratan solo si se piden. */
export const ADICIONALES_GMM = {
  DENTAL: "Dental",
  VISION: "Visión",
  EMERGENCIA_EXTRANJERO: "Emergencia en el extranjero",
  CATASTROFICAS_EXTRANJERO: "Enfermedades catastróficas en el extranjero",
  REDUCCION_DEDUCIBLE: "Reducción de deducible",
  PROTECCION_GARANTIZADA: "Protección garantizada",
  ESTUDIANTES_EXTRANJERO: "Estudiantes en el extranjero",
  MUERTE_ACCIDENTAL: "Muerte accidental ($100,000 si no se indica otra suma)",
} as const;
export type AdicionalGMM = keyof typeof ADICIONALES_GMM;

/** Los de MetLife MédicaLife (el 2026-11-18): 0 a 30 %. */
export const COASEGUROS = [0, 5, 10, 12, 14, 15, 16, 20, 25, 30] as const;

/** Máximo de asegurados en una solicitud (titular, cónyuge e hijos). */
export const MAX_ASEGURADOS = 10;

export const ESTADOS_MX = [
  "AGUASCALIENTES", "BAJA CALIFORNIA", "BAJA CALIFORNIA SUR", "CAMPECHE", "CHIAPAS", "CHIHUAHUA",
  "CIUDAD DE MEXICO", "COAHUILA", "COLIMA", "DURANGO", "ESTADO DE MEXICO", "GUANAJUATO", "GUERRERO",
  "HIDALGO", "JALISCO", "MICHOACAN", "MORELOS", "NAYARIT", "NUEVO LEON", "OAXACA", "PUEBLA",
  "QUERETARO", "QUINTANA ROO", "SAN LUIS POTOSI", "SINALOA", "SONORA", "TABASCO", "TAMAULIPAS",
  "TLAXCALA", "VERACRUZ", "YUCATAN", "ZACATECAS",
] as const;
export type EstadoMx = (typeof ESTADOS_MX)[number];

export type AseguradoGMM = {
  parentesco: Parentesco;
  /** Opcional para cotizar. */
  nombre: string | null;
  /** yyyy-mm-dd; de aquí sale la edad que piden los portales. */
  fechaNacimiento: string;
  sexo: "H" | "M";
};

export type DatosCotizacionGMM = {
  ramo: "GMM";
  aseguradora: AseguradoraGMM;
  /** El primero es el titular; a lo más un cónyuge. */
  asegurados: AseguradoGMM[];
  /** Domicilio del titular (la tarifa cambia por zona). */
  codigoPostal: string;
  estado: EstadoMx;
  municipio: string;
  plan: NivelPlan;
  /** En pesos; null = la que recomiende el portal para el plan. */
  sumaAsegurada: number | null;
  deducible: number | null;
  /** Porcentaje; null = el del portal. */
  coaseguro: number | null;
  adicionales: AdicionalGMM[];
  formaPago: FormaPago;
  /** Qué más se necesita, en palabras de quien la pide. El robot lo lee. */
  notas: string | null;
};

/**
 * Lo que se propone de entrada (por definir con la dirección): plan medio, deducible y suma que
 * recomiende el portal, coaseguro 10 %, sin adicionales y pago anual.
 */
export const GMM_PREDETERMINADO = {
  plan: "MEDIO",
  sumaAsegurada: null,
  deducible: null,
  coaseguro: 10,
  adicionales: [],
  formaPago: "CONTADO",
} as const satisfies Partial<DatosCotizacionGMM>;

const esFechaISO = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function monto(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 1_000_000_000) return undefined;
  return Math.round(n);
}

/** Valida lo que manda el formulario de GMM y lo deja en la forma que lee el robot. */
export function validarDatosGMM(entrada: unknown, hoy = hoyISO()): Validacion<DatosCotizacionGMM> {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Datos inválidos." };
  const e = entrada as Record<string, unknown>;

  if (typeof e.aseguradora !== "string" || !Object.hasOwn(ASEGURADORAS_GMM, e.aseguradora)) {
    return { ok: false, error: "Elige una aseguradora." };
  }

  if (!Array.isArray(e.asegurados) || e.asegurados.length === 0) return { ok: false, error: "Agrega al menos al titular." };
  if (e.asegurados.length > MAX_ASEGURADOS) return { ok: false, error: `A lo más ${MAX_ASEGURADOS} asegurados por cotización.` };
  const asegurados: AseguradoGMM[] = [];
  for (const [i, a] of e.asegurados.entries()) {
    if (typeof a !== "object" || a === null) return { ok: false, error: "Algún asegurado no es válido." };
    const x = a as Record<string, unknown>;
    const parentesco = x.parentesco as Parentesco;
    if (!(PARENTESCOS as readonly unknown[]).includes(parentesco)) return { ok: false, error: "Algún parentesco no es válido." };
    if ((i === 0) !== (parentesco === "TITULAR")) return { ok: false, error: "El primer asegurado debe ser el titular, y solo uno." };
    const fechaNacimiento = texto(x.fechaNacimiento, 10);
    const quien = ETIQUETA_PARENTESCO[parentesco].toLowerCase();
    if (!esFechaISO(fechaNacimiento)) return { ok: false, error: `Falta la fecha de nacimiento del ${quien}.` };
    if (fechaNacimiento > hoy) return { ok: false, error: "Una fecha de nacimiento no puede ser futura." };
    if (x.sexo !== "H" && x.sexo !== "M") return { ok: false, error: `Falta el sexo del ${quien}.` };
    asegurados.push({ parentesco, nombre: texto(x.nombre, 120).toUpperCase() || null, fechaNacimiento, sexo: x.sexo });
  }
  if (asegurados.filter((a) => a.parentesco === "CONYUGE").length > 1) return { ok: false, error: "Solo puede haber un cónyuge." };

  const codigoPostal = texto(e.codigoPostal, 5);
  if (!/^\d{5}$/.test(codigoPostal)) return { ok: false, error: "El código postal debe tener 5 dígitos." };
  const estado = e.estado as EstadoMx;
  if (!(ESTADOS_MX as readonly unknown[]).includes(estado)) return { ok: false, error: "Elige el estado." };
  const municipio = texto(e.municipio, 80).toUpperCase();
  if (!municipio) return { ok: false, error: "Falta el municipio." };

  const plan = e.plan as NivelPlan;
  if (!(NIVELES_PLAN as readonly unknown[]).includes(plan)) return { ok: false, error: "Elige el plan." };
  const sumaAsegurada = monto(e.sumaAsegurada);
  const deducible = monto(e.deducible);
  if (sumaAsegurada === undefined || deducible === undefined) return { ok: false, error: "La suma asegurada o el deducible no es un monto válido." };
  if (sumaAsegurada !== null && deducible !== null && deducible >= sumaAsegurada) {
    return { ok: false, error: "El deducible debe ser menor que la suma asegurada." };
  }
  const coaseguro = e.coaseguro === null || e.coaseguro === undefined || e.coaseguro === "" ? null : Number(e.coaseguro);
  if (coaseguro !== null && !(COASEGUROS as readonly number[]).includes(coaseguro)) return { ok: false, error: "El coaseguro no es válido." };

  const adicionalesEntrada = e.adicionales ?? [];
  if (!Array.isArray(adicionalesEntrada) || adicionalesEntrada.some((x) => typeof x !== "string" || !Object.hasOwn(ADICIONALES_GMM, x))) {
    return { ok: false, error: "Alguna cobertura adicional no es válida." };
  }
  if (!(FORMAS_PAGO as readonly unknown[]).includes(e.formaPago)) return { ok: false, error: "Elige la forma de pago." };

  return {
    ok: true,
    valor: {
      ramo: "GMM",
      aseguradora: e.aseguradora as AseguradoraGMM,
      asegurados,
      codigoPostal,
      estado,
      municipio,
      plan,
      sumaAsegurada,
      deducible,
      coaseguro,
      adicionales: [...new Set(adicionalesEntrada as AdicionalGMM[])],
      formaPago: e.formaPago as FormaPago,
      notas: texto(e.notas, 500) || null,
    },
  };
}

/** "Titular H 45 · cónyuge M 43 · 2 hijos", para la lista de cotizaciones. */
export function resumenAsegurados(asegurados: AseguradoGMM[], hoy = hoyISO()): string {
  const edad = (f: string) => {
    const [a, m, d] = f.split("-").map(Number);
    const [ha, hm, hd] = hoy.split("-").map(Number);
    return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
  };
  const t = asegurados[0];
  const partes = t ? [`Titular ${t.sexo === "H" ? "H" : "M"} ${edad(t.fechaNacimiento)}`] : [];
  const c = asegurados.find((a) => a.parentesco === "CONYUGE");
  if (c) partes.push(`cónyuge ${c.sexo} ${edad(c.fechaNacimiento)}`);
  const hijos = asegurados.filter((a) => a.parentesco === "HIJO").length;
  if (hijos) partes.push(hijos === 1 ? "1 hijo" : `${hijos} hijos`);
  return partes.join(" · ");
}
