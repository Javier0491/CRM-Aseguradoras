// Reglas del robot cotizador: qué datos lleva una solicitud de cotización de auto, qué devuelve el
// robot y cómo se validan. Sin dependencias del servidor para poder probarlas y usarlas en el
// formulario.
//
// Cómo funciona: el usuario pide la cotización en el CRM; la computadora de la oficina (Claude
// manejando el Chrome donde está abierta la sesión del portal de la aseguradora) la toma por
// /api/cotizador/robot, cotiza en el portal y devuelve el resultado. El CRM nunca entra a los
// portales ni guarda sus contraseñas.

import { hoyISO } from "@/lib/format";

/**
 * Aseguradoras que el robot ya sabe cotizar y qué exige su portal además del código postal (lo vimos
 * en las cotizaciones de prueba del 2026-11-18):
 * - `pideConductor`: fecha de nacimiento (edad) y sexo del conductor.
 * - `pideNombre`: nombre del conductor.
 * - `pideMunicipio`: municipio de circulación (no lo deduce del código postal).
 */
export const ASEGURADORAS_COTIZADOR = {
  QUALITAS: {
    nombre: "Qualitas",
    portal: "https://agentes360.qualitas.com.mx/group/guest/inicio",
    pideConductor: false,
    pideNombre: false,
    pideMunicipio: false,
  },
  ZURICH: {
    nombre: "Zurich",
    portal: "https://www.zurich.com.mx/PortalAgentes/produccion/autos/nuevaCotizacion",
    pideConductor: true,
    pideNombre: false,
    pideMunicipio: false,
  },
  MAPFRE: {
    nombre: "Mapfre",
    portal: "https://zonaliados.mapfre.com.mx/zonaliados/Index.aspx",
    pideConductor: true,
    pideNombre: true,
    pideMunicipio: false,
  },
  AFIRME: {
    nombre: "Afirme",
    portal: "https://www.afirmeseguros.com/cercania360/#/inicio",
    pideConductor: false,
    pideNombre: false,
    pideMunicipio: false,
  },
  GNP: {
    nombre: "GNP",
    portal: "https://portalintermediarios.gnp.com.mx/home/dashboard",
    pideConductor: true,
    pideNombre: false,
    pideMunicipio: false,
  },
  HDI: {
    nombre: "HDI",
    portal: "https://smartoffice.hdi.com.mx/dashboard",
    pideConductor: false,
    pideNombre: false,
    pideMunicipio: false,
  },
  EL_POTOSI: {
    nombre: "El Potosí",
    portal: "https://autos.elpotosi.com.mx/SeguroDeAutomovil/oficinavirtual/CotizadorAutos/Cotizacion",
    pideConductor: true,
    pideNombre: false,
    pideMunicipio: true,
  },
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

export const TIPOS_VEHICULO = ["AUTO", "PICKUP", "CAMION", "MOTO"] as const;
export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number];
export const ETIQUETA_TIPO_VEHICULO: Record<TipoVehiculo, string> = {
  AUTO: "Auto",
  PICKUP: "Pickup",
  CAMION: "Camión ligero",
  MOTO: "Motocicleta",
};

export const PROCEDENCIAS = ["RESIDENTE", "FRONTERIZO", "LEGALIZADO"] as const;
export type Procedencia = (typeof PROCEDENCIAS)[number];
export const ETIQUETA_PROCEDENCIA: Record<Procedencia, string> = {
  RESIDENTE: "Nacional (residente)",
  FRONTERIZO: "Fronterizo",
  LEGALIZADO: "Legalizado",
};

/** Cómo se fija la suma asegurada del vehículo. */
export const VALORES_VEHICULO = ["COMERCIAL", "FACTURA", "CONVENIDO"] as const;
export type ValorVehiculo = (typeof VALORES_VEHICULO)[number];
export const ETIQUETA_VALOR: Record<ValorVehiculo, string> = {
  COMERCIAL: "Valor comercial",
  FACTURA: "Valor factura",
  CONVENIDO: "Valor convenido",
};

export const TIPOS_PERSONA = ["FISICA", "MORAL"] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];

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
    /** Desde el multicotizador (2026-11-18). Las solicitudes anteriores no los traen: auto, residente, comercial. */
    tipo: TipoVehiculo;
    procedencia: Procedencia;
    valor: ValorVehiculo;
  };
  /** Persona física o moral del contratante. */
  tipoPersona: TipoPersona;
  /** Inicio de vigencia (yyyy-mm-dd); la vigencia es anual. */
  vigenciaInicio: string;
  /** Muchas veces no se tiene la INE: lo único indispensable para cotizar es el código postal. */
  conductor: {
    nombre: string | null;
    /** yyyy-mm-dd */
    fechaNacimiento: string | null;
    sexo: "H" | "M" | null;
    codigoPostal: string;
    /** Municipio de circulación (lo exige El Potosí). Anteriores al 2026-11-19 no lo traen. */
    municipio?: string | null;
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

/** Máximo de aseguradoras por envío del multicotizador. */
export const MAX_ASEGURADORAS_POR_ENVIO = 10;

/**
 * Aseguradoras elegidas en el multicotizador: sin repetir, entre 1 y MAX_ASEGURADORAS_POR_ENVIO, y
 * solo las que ya se pueden cotizar (hoy, las que maneja el robot).
 */
export function validarAseguradoras(entrada: unknown): Validacion<AseguradoraCotizador[]> {
  if (!Array.isArray(entrada) || entrada.length === 0) return { ok: false, error: "Elige al menos una aseguradora." };
  const claves = [...new Set(entrada)];
  if (claves.length > MAX_ASEGURADORAS_POR_ENVIO) {
    return { ok: false, error: `Elige a lo más ${MAX_ASEGURADORAS_POR_ENVIO} aseguradoras por envío.` };
  }
  if (claves.some((k) => typeof k !== "string" || !Object.hasOwn(ASEGURADORAS_COTIZADOR, k))) {
    return { ok: false, error: "Alguna aseguradora todavía no se puede cotizar." };
  }
  return { ok: true, valor: claves as AseguradoraCotizador[] };
}

/** Valida lo que manda el formulario y lo deja en la forma que lee el robot. */
/** `hoy` (yyyy-mm-dd, hora de México) es el mínimo del inicio de vigencia y el valor por defecto. */
export function validarDatosCotizacion(entrada: unknown, hoy = hoyISO()): Validacion<DatosCotizacionAuto> {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, error: "Datos inválidos." };
  const e = entrada as Record<string, Record<string, unknown> | unknown>;
  const v = (e.vehiculo ?? {}) as Record<string, unknown>;
  const c = (e.conductor ?? {}) as Record<string, unknown>;
  const k = (e.coberturas ?? {}) as Record<string, unknown>;

  if (typeof e.aseguradora !== "string" || !Object.hasOwn(ASEGURADORAS_COTIZADOR, e.aseguradora)) {
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
  const aseg = ASEGURADORAS_COTIZADOR[e.aseguradora as AseguradoraCotizador];
  if (aseg.pideConductor && (!fechaNacimiento || !sexo)) {
    return { ok: false, error: `${aseg.nombre} necesita la fecha de nacimiento y el sexo del conductor.` };
  }
  if (aseg.pideNombre && !nombre) return { ok: false, error: `${aseg.nombre} necesita el nombre del conductor.` };
  const municipio = textoOpcional(c.municipio, 80)?.toUpperCase() ?? null;
  if (aseg.pideMunicipio && !municipio) return { ok: false, error: `${aseg.nombre} necesita el municipio de circulación.` };
  if (fechaNacimiento && fechaNacimiento > hoy) return { ok: false, error: "La fecha de nacimiento no puede ser futura." };

  const opcion = <T extends string>(valor: unknown, opciones: readonly T[], porDefecto: T): T | undefined =>
    valor === undefined || valor === null || valor === "" ? porDefecto : (opciones as readonly unknown[]).includes(valor) ? (valor as T) : undefined;
  const tipo = opcion(v.tipo, TIPOS_VEHICULO, "AUTO");
  const procedencia = opcion(v.procedencia, PROCEDENCIAS, "RESIDENTE");
  const valor = opcion(v.valor, VALORES_VEHICULO, "COMERCIAL");
  const tipoPersona = opcion(e.tipoPersona, TIPOS_PERSONA, "FISICA");
  if (!tipo || !procedencia || !valor || !tipoPersona) return { ok: false, error: "Algún dato del vehículo o del contratante no es válido." };
  const vigenciaInicio = textoOpcional(e.vigenciaInicio, 10) ?? hoy;
  if (!esFechaISO(vigenciaInicio) || vigenciaInicio < hoy) {
    return { ok: false, error: "El inicio de vigencia debe ser hoy o una fecha futura." };
  }

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
        tipo,
        procedencia,
        valor,
      },
      tipoPersona,
      vigenciaInicio,
      conductor: { nombre, fechaNacimiento, sexo, codigoPostal, municipio },
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

/**
 * Aseguradoras cuyo portal tiene sesión abierta en la oficina, según el parámetro `?aseguradoras=`
 * con que el robot pide trabajo (p. ej. "QUALITAS,GNP"). Sin parámetro: todas (null). Las claves
 * desconocidas se ignoran; si no queda ninguna, la lista vacía hace que no reciba nada.
 */
export function aseguradorasDelRobot(parametro: string | null): AseguradoraCotizador[] | null {
  if (parametro === null) return null;
  const claves = parametro
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is AseguradoraCotizador => Object.hasOwn(ASEGURADORAS_COTIZADOR, s));
  return [...new Set(claves)];
}

/** Prefijo de las llaves del robot: permite reconocerlas si alguien las pega donde no debe. */
export const PREFIJO_LLAVE = "zsr_";

/** Una solicitud en COTIZANDO más tiempo que esto se da por abandonada (el robot se apagó a medias). */
export const MINUTOS_ABANDONO = 20;

/** Sin contacto del robot en este tiempo, la pantalla avisa que la computadora parece apagada. */
export const MINUTOS_ROBOT_ACTIVO = 10;

/**
 * Tamaño máximo del PDF de la aseguradora. El robot lo manda en el cuerpo de la solicitud y Vercel
 * no acepta cuerpos de más de 4.5 MB; el de Qualitas pesa unos 20 KB.
 */
export const MAX_BYTES_PDF = 4 * 1024 * 1024;

/** ¿Los primeros bytes son de un PDF (%PDF-)? No se confía en el tipo que dice la solicitud. */
export function esPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => bytes[i] === b);
}

/** Clave nueva del PDF de una solicitud en el almacenamiento: cotizaciones/{agenciaId}/{id}/{uuid}.pdf. */
export function clavePdfCotizacion(agenciaId: string, solicitudId: string): string {
  return `cotizaciones/${agenciaId}/${solicitudId}/${crypto.randomUUID()}.pdf`;
}

/** Nombre con que se descarga el PDF, p. ej. «Cotizacion Qualitas 1251879762 HYUNDAI HB 2023.pdf». */
export function nombrePdfCotizacion(
  aseguradora: string,
  numeroCotizacion: string | null | undefined,
  vehiculo: { marca?: string; modelo?: string; anio?: number } | undefined
): string {
  const nombreAseg =
    Object.hasOwn(ASEGURADORAS_COTIZADOR, aseguradora)
      ? ASEGURADORAS_COTIZADOR[aseguradora as AseguradoraCotizador].nombre
      : aseguradora;
  const partes = ["Cotizacion", nombreAseg, numeroCotizacion, vehiculo?.marca, vehiculo?.modelo, vehiculo?.anio]
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== "")
    .map((p) => String(p).trim());
  return `${partes.join(" ").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 150)}.pdf`;
}
