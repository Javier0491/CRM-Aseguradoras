// Catálogo del multicotizador: con qué aseguradoras trabaja la promotoría, qué ramos vende cada una y
// por dónde se cotiza cada ramo. Sin dependencias del servidor (lo usa el formulario).
//
// Canal de cada ramo:
// - ROBOT: el robot de la oficina cotiza en el portal con la sesión abierta (puente mientras llega la API).
// - API: el CRM pregunta directo al servicio web de la aseguradora (ninguna conectada todavía).
// - Si el ramo no aparece en `canales`, se muestra como "próximamente": falta escanear su portal o la API.
//
// Los ramos por aseguradora son la lista que dio el dueño el 2026-11-18, con los ramos que vende cada
// una en el mercado; están por confirmar con las ejecutivas.

export const RAMOS_COTIZADOR = ["AUTOS", "GMM", "VIDA", "DANOS", "ACCIDENTES", "VIAJE", "FIANZAS"] as const;
export type RamoCotizador = (typeof RAMOS_COTIZADOR)[number];

export const ETIQUETA_RAMO: Record<RamoCotizador, string> = {
  AUTOS: "Autos",
  GMM: "Gastos médicos mayores",
  VIDA: "Vida",
  DANOS: "Daños y RC",
  ACCIDENTES: "Accidentes personales",
  VIAJE: "Asistencia en viaje",
  FIANZAS: "Fianzas",
};

export type CanalCotizacion = "ROBOT" | "API";

export type FichaAseguradora = {
  nombre: string;
  ramos: readonly RamoCotizador[];
  /** Ramos que ya se pueden cotizar y por dónde. */
  canales: Partial<Record<RamoCotizador, CanalCotizacion>>;
  /** Portal de agentes (lo abre una persona en el Chrome de servicio). */
  portal?: string;
};

export const CATALOGO_ASEGURADORAS = {
  QUALITAS: {
    nombre: "Qualitas",
    ramos: ["AUTOS"],
    canales: { AUTOS: "ROBOT" },
    portal: "https://agentes360.qualitas.com.mx/group/guest/inicio",
  },
  METLIFE: { nombre: "MetLife", ramos: ["VIDA", "GMM", "ACCIDENTES"], canales: {} },
  GNP: { nombre: "GNP", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"], canales: {} },
  AXA: { nombre: "AXA", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"], canales: {} },
  MAPFRE: { nombre: "Mapfre", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"], canales: {} },
  HDI: { nombre: "HDI", ramos: ["AUTOS", "DANOS"], canales: {} },
  ANA: { nombre: "ANA Seguros", ramos: ["AUTOS"], canales: {} },
  ZURICH: {
    nombre: "Zurich",
    ramos: ["AUTOS", "DANOS", "GMM"],
    canales: { AUTOS: "ROBOT" },
    portal: "https://miportal.zurich.com.mx/agente/inicio",
  },
  SURA: { nombre: "Sura", ramos: ["AUTOS", "DANOS"], canales: {} },
  AFIRME: { nombre: "Afirme", ramos: ["AUTOS", "VIDA", "DANOS"], canales: {} },
  ATLAS: { nombre: "Seguros Atlas", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"], canales: {} },
  EL_POTOSI: { nombre: "El Potosí", ramos: ["AUTOS", "GMM", "VIDA", "DANOS"], canales: {} },
  GMX: { nombre: "GMX", ramos: ["AUTOS", "DANOS"], canales: {} },
  BX_MAS: { nombre: "BX+", ramos: ["AUTOS", "VIDA", "GMM", "DANOS"], canales: {} },
  PLAN_SEGURO: { nombre: "Plan Seguro", ramos: ["GMM"], canales: {} },
  BUPA: { nombre: "Bupa", ramos: ["GMM"], canales: {} },
  INSIGNIA_LIFE: { nombre: "Insignia Life", ramos: ["VIDA", "ACCIDENTES"], canales: {} },
  THONA: { nombre: "Thona Seguros", ramos: ["ACCIDENTES", "VIDA", "GMM"], canales: {} },
  ASSIST_CARD: { nombre: "Assist Card", ramos: ["VIAJE"], canales: {} },
  ASERTA: { nombre: "Aserta", ramos: ["FIANZAS"], canales: {} },
} as const satisfies Record<string, FichaAseguradora>;

export type ClaveAseguradora = keyof typeof CATALOGO_ASEGURADORAS;

const ficha = (clave: ClaveAseguradora): FichaAseguradora => CATALOGO_ASEGURADORAS[clave];

/** Nombre comercial de una clave del catálogo (o la clave tal cual si no existe). */
export function nombreAseguradora(clave: string): string {
  return Object.hasOwn(CATALOGO_ASEGURADORAS, clave) ? ficha(clave as ClaveAseguradora).nombre : clave;
}

/** Por dónde se cotiza ese ramo en esa aseguradora, o null si todavía no se puede. */
export function canalDe(clave: string, ramo: RamoCotizador): CanalCotizacion | null {
  return Object.hasOwn(CATALOGO_ASEGURADORAS, clave) ? (ficha(clave as ClaveAseguradora).canales[ramo] ?? null) : null;
}

/** Aseguradoras que venden el ramo, primero las que ya se pueden cotizar y luego por nombre. */
export function aseguradorasDelRamo(ramo: RamoCotizador): { clave: ClaveAseguradora; nombre: string; canal: CanalCotizacion | null }[] {
  return (Object.keys(CATALOGO_ASEGURADORAS) as ClaveAseguradora[])
    .filter((k) => ficha(k).ramos.includes(ramo))
    .map((k) => ({ clave: k, nombre: ficha(k).nombre, canal: canalDe(k, ramo) }))
    .sort((a, b) => Number(b.canal !== null) - Number(a.canal !== null) || a.nombre.localeCompare(b.nombre, "es"));
}
