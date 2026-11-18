// Reglas del robot cotizador: qué datos lleva una solicitud de cotización de auto, qué devuelve el
// robot y cómo se validan. Sin dependencias del servidor para poder probarlas y usarlas en el
// formulario.
//
// Cómo funciona: el usuario pide la cotización en el CRM; la computadora de la oficina (Claude
// manejando el Chrome donde está abierta la sesión del portal de la aseguradora) la toma por
// /api/cotizador/robot, cotiza en el portal y devuelve el resultado. El CRM nunca entra a los
// portales ni guarda sus contraseñas.

export const ASEGURADORAS_COTIZADOR = {
  QUALITAS: { nombre: "Qualitas", portal: "https://agentes360.qualitas.com.mx/group/guest/inicio" },
} as const;
export type AseguradoraCotizador = keyof typeof ASEGURADORAS_COTIZADOR;

export const PAQUETES = ["AMPLIA", "LIMITADA", "RC"] as const;
export type Paquete = (typeof PAQUETES)[number];
export const ETIQUETA_PAQUETE: Record<Paquete, string> = {
  AMPLIA: "Amplia",
  LIMITADA: "Limitada",
  RC: "Responsabilidad civil",
};

export const FORMAS_PAGO = ["CONTADO", "SEMESTRAL", "TRIMESTRAL", "MENSUAL"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];
export const ETIQUETA_FORMA_PAGO: Record<FormaPago, string> = {
  CONTADO: "Contado (anual)",
  SEMESTRAL: "Semestral",
  TRIMESTRAL: "Trimestral",
  MENSUAL: "Mensual",
};

/**
 * Coberturas extra que se contratan solo si se piden (nombres como en el portal de Qualitas).
 * RC daños a ocupantes y RC complementaria van aparte porque llevan suma asegurada.
 */
export const EXTRAS = {
  AUTO_SUSTITUTO: "Auto sustituto por pérdida parcial y total",
  EXENCION_DEDUCIBLE_PT_DM: "Exención de deducible por pérdida total (daños materiales)",
  EXENCION_DEDUCIBLE_RT: "Exención de deducible por robo total",
  REDUCCION_DEDUCIBLE_RT_SAT: "Reducción de deducible RT y servicio de asistencia satelital",
  ROBO_PARCIAL: "Robo parcial",
  LLANTAS: "Llantas",
  RINES: "Rines",
  GASTOS_TRANSPORTE_PT: "Gastos de transporte por pérdida total",
  GASTOS_TRANSPORTE_PP: "Gastos de transporte por pérdida parcial",
  AUTO_AGENCIA: "Auto agencia",
  RC_CRUZADA: "RC cruzada",
  ARRASTRE_REMOLQUE: "Arrastre de remolque",
  EQUIPO_ESPECIAL: "Equipo especial",
  ADAPTACIONES: "Adaptaciones",
} as const;
export type Extra = keyof typeof EXTRAS;

export const DEDUCIBLES_DM = [3, 5, 10, 20] as const;
export const DEDUCIBLES_RT = [5, 10, 20] as const;

export type DatosCotizacionAuto = {
  aseguradora: AseguradoraCotizador;
  vehiculo: {
    anio: number;
    /** Marca, modelo y versión como vienen en la tarjeta de circulación o la factura. */
    marca: string;
    modelo: string;
    version: string;
    transmision: "AUT" | "STD";
    /** Número de serie (VIN); opcional para cotizar. */
    serie: string | null;
    placas: string | null;
    uso: "PARTICULAR";
  };
  /** Muchas veces no se tiene la INE: lo único indispensable para cotizar es el código postal. */
  conductor: {
    nombre: string | null;
    /** yyyy-mm-dd */
    fechaNacimiento: string | null;
    sexo: "H" | "M" | null;
    codigoPostal: string;
  };
  coberturas: {
    paquete: Paquete;
    /** Porcentaje del deducible de daños materiales y de robo total. */
    deducibleDM: number;
    deducibleRT: number;
    /** Sumas aseguradas en pesos; null = la que traiga el portal. */
    responsabilidadCivil: number | null;
    gastosMedicosOcupantes: number | null;
    muerteConductor: number | null;
    /** Adicionales; null = no se contratan. */
    rcDanosOcupantes: number | null;
    rcComplementariaPersonas: number | null;
    /** Otras coberturas extra que se piden (sin ellas, solo el paquete básico). */
    extras: Extra[];
    /** Aplicar la bonificación técnica máxima que permita el portal. */
    bonificacionMaxima: boolean;
  };
  formaPago: FormaPago;
  /** Qué más se necesita, en palabras de quien la pide (sumas de equipo especial, otra cobertura…). El robot lo lee. */
  notas: string | null;
};

/**
 * Paquete básico de la agencia (lo definió la dirección de PJ Magnus el 2026-11-17): Amplia, DM 5%,
 * RT 10%, RC 3 millones, gastos médicos ocupantes 200 mil, muerte del conductor 100 mil, sin
 * adicionales y con la bonificación técnica máxima.
 */
export const COBERTURAS_PREDETERMINADAS: DatosCotizacionAuto["coberturas"] = {
  paquete: "AMPLIA",
  deducibleDM: 5,
  deducibleRT: 10,
  responsabilidadCivil: 3_000_000,
  gastosMedicosOcupantes: 200_000,
  muerteConductor: 100_000,
  rcDanosOcupantes: null,
  rcComplementariaPersonas: null,
  extras: [],
  bonificacionMaxima: true,
};

export type RenglonCobertura = {
  cobertura: string;
  sumaAsegurada: string | null;
  deducible: string | null;
  prima: number | null;
};

export type ResultadoCotizacion = {
  /** Folio con el que el portal guardó la cotización. */
  numeroCotizacion: string | null;
  paquete: string;
  formaPago: FormaPago;
  primaTotal: number;
  primaNeta: number | null;
  derechoPoliza: number | null;
  iva: number | null;
  /** Bonificación técnica aplicada (porcentaje). */
  bonificacion: number | null;
  /** Suma asegurada del vehículo (valor convenido o comercial). */
  sumaAseguradaVehiculo: number | null;
  /** Otras formas de pago, si el portal las dio ya recalculadas. */
  otrasFormasPago: { formaPago: FormaPago; primaTotal: number }[];
  coberturas: RenglonCobertura[];
  /** Avisos del portal (p. ej. "la serie está amparada en la póliza vigente …"). */
  avisos: string[];
};

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

const MAX_TEXTO = 200;
const anioActual = () => new Date().getFullYear();

function texto(v: unknown, max = MAX_TEXTO): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function textoOpcional(v: unknown, max = MAX_TEXTO): string | null {
  const t = texto(v, max);
  return t ? t : null;
}

function montoOpcional(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100_000_000) return undefined;
  return Math.round(n);
}

const esFechaISO = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

/** Edad cumplida a una fecha (yyyy-mm-dd), para mostrarla junto a la fecha de nacimiento. */
export function edadEn(fechaNacimiento: string, hoy: string): number | null {
  if (!esFechaISO(fechaNacimiento) || !esFechaISO(hoy)) return null;
  const [a, m, d] = fechaNacimiento.split("-").map(Number);
  const [ha, hm, hd] = hoy.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

/** Valida lo que manda el formulario y lo deja en la forma que lee el robot. */
export function validarDatosCotizacion(entrada: unknown): Validacion<DatosCotizacionAuto> {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Datos inválidos." };
  const e = entrada as Record<string, Record<string, unknown> | unknown>;
  const v = (e.vehiculo ?? {}) as Record<string, unknown>;
  const c = (e.conductor ?? {}) as Record<string, unknown>;
  const k = (e.coberturas ?? {}) as Record<string, unknown>;

  if (typeof e.aseguradora !== "string" || !(e.aseguradora in ASEGURADORAS_COTIZADOR)) {
    return { ok: false, error: "Elige una aseguradora." };
  }

  const anio = Number(v.anio);
  if (!Number.isInteger(anio) || anio < 1980 || anio > anioActual() + 1) {
    return { ok: false, error: "El año del vehículo no es válido." };
  }
  const marca = texto(v.marca, 60).toUpperCase();
  const modelo = texto(v.modelo, 80).toUpperCase();
  const version = texto(v.version, 120).toUpperCase();
  if (!marca || !modelo) return { ok: false, error: "Falta la marca o el modelo del vehículo." };
  if (v.transmision !== "AUT" && v.transmision !== "STD") {
    return { ok: false, error: "Indica si el vehículo es automático o estándar." };
  }
  const serie = textoOpcional(v.serie, 17)?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
  if (serie && serie.length !== 17) return { ok: false, error: "El número de serie (VIN) debe tener 17 caracteres." };

  const nombre = textoOpcional(c.nombre, 120)?.toUpperCase() ?? null;
  const codigoPostal = texto(c.codigoPostal, 5);
  if (!/^\d{5}$/.test(codigoPostal)) return { ok: false, error: "El código postal debe tener 5 dígitos." };
  const fechaNacimiento = textoOpcional(c.fechaNacimiento, 10);
  if (fechaNacimiento && !esFechaISO(fechaNacimiento)) return { ok: false, error: "La fecha de nacimiento no es válida." };
  const sexo = c.sexo === "H" || c.sexo === "M" ? c.sexo : null;

  if (!(PAQUETES as readonly unknown[]).includes(k.paquete)) return { ok: false, error: "Elige el paquete de coberturas." };
  const deducibleDM = Number(k.deducibleDM);
  const deducibleRT = Number(k.deducibleRT);
  if (!(DEDUCIBLES_DM as readonly number[]).includes(deducibleDM)) {
    return { ok: false, error: "El deducible de daños materiales no es válido." };
  }
  if (!(DEDUCIBLES_RT as readonly number[]).includes(deducibleRT)) {
    return { ok: false, error: "El deducible de robo total no es válido." };
  }
  const montos = {
    responsabilidadCivil: montoOpcional(k.responsabilidadCivil),
    gastosMedicosOcupantes: montoOpcional(k.gastosMedicosOcupantes),
    muerteConductor: montoOpcional(k.muerteConductor),
    rcDanosOcupantes: montoOpcional(k.rcDanosOcupantes),
    rcComplementariaPersonas: montoOpcional(k.rcComplementariaPersonas),
  };
  if (Object.values(montos).some((m) => m === undefined)) {
    return { ok: false, error: "Alguna suma asegurada no es un monto válido." };
  }
  const extrasEntrada = k.extras ?? [];
  if (!Array.isArray(extrasEntrada) || extrasEntrada.some((x) => typeof x !== "string" || !(x in EXTRAS))) {
    return { ok: false, error: "Alguna cobertura extra no es válida." };
  }
  const extras = [...new Set(extrasEntrada as Extra[])];

  if (!(FORMAS_PAGO as readonly unknown[]).includes(e.formaPago)) return { ok: false, error: "Elige la forma de pago." };

  return {
    ok: true,
    valor: {
      aseguradora: e.aseguradora as AseguradoraCotizador,
      vehiculo: {
        anio,
        marca,
        modelo,
        version,
        transmision: v.transmision,
        serie,
        placas: textoOpcional(v.placas, 10)?.toUpperCase() ?? null,
        uso: "PARTICULAR",
      },
      conductor: { nombre, fechaNacimiento, sexo, codigoPostal },
      coberturas: {
        paquete: k.paquete as Paquete,
        deducibleDM,
        deducibleRT,
        ...(montos as { [K in keyof typeof montos]: number | null }),
        extras,
        bonificacionMaxima: k.bonificacionMaxima === true,
      },
      formaPago: e.formaPago as FormaPago,
      notas: textoOpcional(e.notas, 500),
    },
  };
}

function numeroOpcional(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Valida lo que devuelve el robot antes de guardarlo (no se confía en lo que llega por la API). */
export function validarResultado(entrada: unknown): Validacion<ResultadoCotizacion> {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Resultado inválido." };
  const r = entrada as Record<string, unknown>;
  const primaTotal = numeroOpcional(r.primaTotal);
  if (typeof primaTotal !== "number" || primaTotal <= 0) return { ok: false, error: "Falta la prima total." };
  if (!(FORMAS_PAGO as readonly unknown[]).includes(r.formaPago)) return { ok: false, error: "Forma de pago inválida." };

  const opcionales = {
    primaNeta: numeroOpcional(r.primaNeta),
    derechoPoliza: numeroOpcional(r.derechoPoliza),
    iva: numeroOpcional(r.iva),
    bonificacion: numeroOpcional(r.bonificacion),
    sumaAseguradaVehiculo: numeroOpcional(r.sumaAseguradaVehiculo),
  };
  if (Object.values(opcionales).some((n) => n === undefined)) return { ok: false, error: "Algún importe no es un número." };

  const coberturas: RenglonCobertura[] = [];
  for (const fila of Array.isArray(r.coberturas) ? r.coberturas.slice(0, 40) : []) {
    if (typeof fila !== "object" || fila === null) return { ok: false, error: "Cobertura inválida." };
    const f = fila as Record<string, unknown>;
    const prima = numeroOpcional(f.prima);
    if (prima === undefined || !texto(f.cobertura)) return { ok: false, error: "Cobertura inválida." };
    coberturas.push({
      cobertura: texto(f.cobertura, 80),
      sumaAsegurada: textoOpcional(f.sumaAsegurada, 40),
      deducible: textoOpcional(f.deducible, 40),
      prima,
    });
  }

  const otrasFormasPago: ResultadoCotizacion["otrasFormasPago"] = [];
  for (const o of Array.isArray(r.otrasFormasPago) ? r.otrasFormasPago.slice(0, 4) : []) {
    const f = o as Record<string, unknown>;
    if (
      typeof o !== "object" ||
      o === null ||
      !(FORMAS_PAGO as readonly unknown[]).includes(f.formaPago) ||
      typeof f.primaTotal !== "number" ||
      !(f.primaTotal > 0)
    ) {
      return { ok: false, error: "Forma de pago adicional inválida." };
    }
    otrasFormasPago.push({ formaPago: f.formaPago as FormaPago, primaTotal: f.primaTotal });
  }

  return {
    ok: true,
    valor: {
      numeroCotizacion: textoOpcional(r.numeroCotizacion, 40),
      paquete: texto(r.paquete, 40) || "—",
      formaPago: r.formaPago as FormaPago,
      primaTotal,
      ...(opcionales as { [K in keyof typeof opcionales]: number | null }),
      otrasFormasPago,
      coberturas,
      avisos: (Array.isArray(r.avisos) ? r.avisos : []).map((a) => texto(a, 300)).filter(Boolean).slice(0, 10),
    },
  };
}

/** Prefijo de las llaves del robot: permite reconocerlas si alguien las pega donde no debe. */
export const PREFIJO_LLAVE = "zsr_";

/** Una solicitud en COTIZANDO más tiempo que esto se da por abandonada (el robot se apagó a medias). */
export const MINUTOS_ABANDONO = 20;

/** Sin contacto del robot en este tiempo, la pantalla avisa que la computadora parece apagada. */
export const MINUTOS_ROBOT_ACTIVO = 10;
