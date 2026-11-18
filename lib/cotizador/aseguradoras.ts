// Catálogo del multicotizador: con qué aseguradoras trabaja la promotoría, qué ramos vende cada una y
// por dónde se puede cotizar cada ramo. Sin dependencias del servidor (lo usa el formulario).
//
// Canales:
// - ROBOT: el robot de la oficina cotiza en el portal con la sesión abierta (puente mientras llega la API).
// - API: el CRM pregunta directo al servicio web de la aseguradora (ninguna conectada todavía).
// Cada agencia elige en Multicotizador → Conexiones cuál usar (o apagarla) entre los disponibles; si no
// eligió, se usa la API si existe y si no el robot. Sin ninguno, la aseguradora sale "próximamente".
//
// Los ramos por aseguradora son la lista que dio el dueño el 2026-11-18, con lo que se vio en el
// escaneo de portales y lo que vende cada una en el mercado; están por confirmar con las ejecutivas.

export const RAMOS_COTIZADOR = ["AUTOS", "GMM", "VIDA", "DANOS", "ACCIDENTES", "VIAJE", "FIANZAS"] as const;
export type RamoCotizador = (typeof RAMOS_COTIZADOR)[number];

export const ETIQUETA_RAMO: Record<RamoCotizador, string> = {
  AUTOS: "Autos",
  GMM: "Gastos médicos",
  VIDA: "Vida y retiro",
  DANOS: "Daños y RC",
  ACCIDENTES: "Accidentes personales",
  VIAJE: "Viaje",
  FIANZAS: "Fianzas",
};

/** Ramos con formulario en el multicotizador; los demás muestran sus conexiones y lo que pedirán. */
export const RAMOS_CON_FORMULARIO: readonly RamoCotizador[] = ["AUTOS"];

export type CanalCotizacion = "ROBOT" | "API";
/** Lo que elige la agencia para cada aseguradora y ramo. */
export type EleccionCanal = CanalCotizacion | "APAGADO";
/** Elección de la agencia por "CLAVE:RAMO" (columna agencias.cotizador_canales). */
export type ConfigCanales = Record<string, EleccionCanal>;

export type FichaAseguradora = {
  nombre: string;
  ramos: readonly RamoCotizador[];
  /** Ramos que el robot ya sabe cotizar en su portal (skill cotizador-robot). */
  robot?: readonly RamoCotizador[];
  /** Ramos con API conectada (ninguno todavía). */
  api?: readonly RamoCotizador[];
  /** Portal de agentes (lo abre una persona en el Chrome de servicio). */
  portal?: string;
};

export const CATALOGO_ASEGURADORAS = {
  QUALITAS: { nombre: "Qualitas", ramos: ["AUTOS"], robot: ["AUTOS"], portal: "https://agentes360.qualitas.com.mx/group/guest/inicio" },
  METLIFE: { nombre: "MetLife", ramos: ["VIDA", "GMM", "ACCIDENTES"] },
  GNP: { nombre: "GNP", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"] },
  AXA: { nombre: "AXA", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"] },
  MAPFRE: {
    nombre: "Mapfre",
    ramos: ["AUTOS", "GMM", "VIDA", "ACCIDENTES", "DANOS"],
    robot: ["AUTOS"],
    portal: "https://zonaliados.mapfre.com.mx/zonaliados/Index.aspx",
  },
  HDI: { nombre: "HDI", ramos: ["AUTOS", "GMM", "DANOS"], robot: ["AUTOS"], portal: "https://smartoffice.hdi.com.mx/dashboard" },
  ANA: { nombre: "ANA Seguros", ramos: ["AUTOS"] },
  ZURICH: { nombre: "Zurich", ramos: ["AUTOS", "GMM", "DANOS"], robot: ["AUTOS"], portal: "https://miportal.zurich.com.mx/agente/inicio" },
  SURA: { nombre: "Sura", ramos: ["AUTOS", "DANOS"] },
  AFIRME: { nombre: "Afirme", ramos: ["AUTOS", "VIDA", "DANOS"] },
  ATLAS: { nombre: "Seguros Atlas", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"] },
  EL_POTOSI: { nombre: "El Potosí", ramos: ["AUTOS", "VIDA"], robot: ["AUTOS"], portal: "https://portal.elpotosi.com.mx/Inicio/" },
  GMX: { nombre: "GMX", ramos: ["AUTOS", "DANOS"] },
  BX_MAS: { nombre: "BX+", ramos: ["AUTOS", "VIDA", "GMM", "DANOS"] },
  PLAN_SEGURO: { nombre: "Plan Seguro", ramos: ["GMM"] },
  BUPA: { nombre: "Bupa", ramos: ["GMM"] },
  INSIGNIA_LIFE: { nombre: "Insignia Life", ramos: ["VIDA", "ACCIDENTES"] },
  THONA: { nombre: "Thona Seguros", ramos: ["ACCIDENTES", "VIDA", "GMM"] },
  ASSIST_CARD: { nombre: "Assist Card", ramos: ["VIAJE"] },
  ASERTA: { nombre: "Aserta", ramos: ["FIANZAS"] },
} as const satisfies Record<string, FichaAseguradora>;

export type ClaveAseguradora = keyof typeof CATALOGO_ASEGURADORAS;

const existe = (clave: string): clave is ClaveAseguradora => Object.hasOwn(CATALOGO_ASEGURADORAS, clave);
const ficha = (clave: ClaveAseguradora): FichaAseguradora => CATALOGO_ASEGURADORAS[clave];
const esRamo = (r: string): r is RamoCotizador => (RAMOS_COTIZADOR as readonly string[]).includes(r);

/** Nombre comercial de una clave del catálogo (o la clave tal cual si no existe). */
export function nombreAseguradora(clave: string): string {
  return existe(clave) ? ficha(clave).nombre : clave;
}

/** Canales con que se puede cotizar ese ramo en esa aseguradora (API primero). */
export function canalesDisponibles(clave: string, ramo: RamoCotizador): CanalCotizacion[] {
  if (!existe(clave)) return [];
  const f = ficha(clave);
  return [...(f.api?.includes(ramo) ? (["API"] as const) : []), ...(f.robot?.includes(ramo) ? (["ROBOT"] as const) : [])];
}

/** Clave de la elección en ConfigCanales. */
export const claveCanal = (clave: string, ramo: RamoCotizador) => `${clave}:${ramo}`;

/**
 * Por dónde se cotiza ese ramo en esa aseguradora para la agencia: lo que eligió si sigue
 * disponible; si no eligió, la API y si no el robot. null = apagada o todavía sin canal.
 */
export function canalDe(clave: string, ramo: RamoCotizador, config: ConfigCanales = {}): CanalCotizacion | null {
  const disponibles = canalesDisponibles(clave, ramo);
  const elegido = config[claveCanal(clave, ramo)];
  if (elegido === "APAGADO") return null;
  if (elegido && disponibles.includes(elegido)) return elegido;
  return disponibles[0] ?? null;
}

export type AseguradoraDelRamo = {
  clave: ClaveAseguradora;
  nombre: string;
  /** Canal que se usará (null = apagada o sin canal). */
  canal: CanalCotizacion | null;
  disponibles: CanalCotizacion[];
  /** La agencia la apagó a propósito. */
  apagada: boolean;
};

/** Aseguradoras que venden el ramo, primero las que ya se pueden cotizar y luego por nombre. */
export function aseguradorasDelRamo(ramo: RamoCotizador, config: ConfigCanales = {}): AseguradoraDelRamo[] {
  return (Object.keys(CATALOGO_ASEGURADORAS) as ClaveAseguradora[])
    .filter((k) => ficha(k).ramos.includes(ramo))
    .map((k) => {
      const disponibles = canalesDisponibles(k, ramo);
      return {
        clave: k,
        nombre: ficha(k).nombre,
        canal: canalDe(k, ramo, config),
        disponibles,
        apagada: disponibles.length > 0 && config[claveCanal(k, ramo)] === "APAGADO",
      };
    })
    .sort((a, b) => Number(b.canal !== null) - Number(a.canal !== null) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo guardado en la base, sin claves ni valores desconocidos. */
export function leerConfigCanales(guardado: unknown): ConfigCanales {
  if (typeof guardado !== "object" || guardado === null || Array.isArray(guardado)) return {};
  const config: ConfigCanales = {};
  for (const [k, v] of Object.entries(guardado)) {
    const [clave, ramo] = k.split(":");
    if (existe(clave) && ramo && esRamo(ramo) && (v === "ROBOT" || v === "API" || v === "APAGADO")) config[k] = v;
  }
  return config;
}

/** ¿Se puede elegir ese canal? Apagar siempre; robot o API solo si existen para ese ramo. */
export function validarEleccionCanal(clave: unknown, ramo: unknown, eleccion: unknown): string | null {
  if (typeof clave !== "string" || !existe(clave)) return "Esa aseguradora no existe.";
  if (typeof ramo !== "string" || !esRamo(ramo) || !ficha(clave).ramos.includes(ramo)) return "Esa aseguradora no vende ese ramo.";
  if (eleccion === "APAGADO") return null;
  if (eleccion !== "ROBOT" && eleccion !== "API") return "Opción inválida.";
  if (!canalesDisponibles(clave, ramo).includes(eleccion)) {
    return eleccion === "API" ? "La API de esa aseguradora todavía no está conectada." : "El robot todavía no sabe cotizar ahí.";
  }
  return null;
}
