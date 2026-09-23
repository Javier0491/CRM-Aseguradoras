// Datos de ejemplo para el resumen directivo.
// Se reemplazarán por consultas a la base de datos cuando exista la capa de datos.

export type EstatusConciliacion = "conciliado" | "diferencia" | "parcial";

export type ReciboConciliado = {
  folio: string;
  poliza: string;
  cliente: string;
  aseguradora: string;
  ramo: string;
  fechaPago: string; // ISO yyyy-mm-dd
  primaTotal: number;
  comision: number;
  estatus: EstatusConciliacion;
};

export type Metrica = {
  id: string;
  titulo: string;
  valor: number;
  formato: "moneda" | "numero" | "porcentaje";
  variacion: number; // % contra el periodo anterior
  detalle: string;
};

export const metricas: Metrica[] = [
  {
    id: "primas",
    titulo: "Primas Emitidas",
    valor: 18_452_310.75,
    formato: "moneda",
    variacion: 12.4,
    detalle: "Acumulado del mes",
  },
  {
    id: "comisiones",
    titulo: "Comisiones Pendientes",
    valor: 1_284_905.2,
    formato: "moneda",
    variacion: -4.8,
    detalle: "Por cobrar a aseguradoras",
  },
  {
    id: "polizas",
    titulo: "Pólizas Activas",
    valor: 3_847,
    formato: "numero",
    variacion: 3.1,
    detalle: "Vigentes al cierre",
  },
  {
    id: "renovacion",
    titulo: "Tasa de Renovación",
    valor: 87.6,
    formato: "porcentaje",
    variacion: 1.9,
    detalle: "Últimos 12 meses",
  },
];

export const recibosConciliados: ReciboConciliado[] = [
  { folio: "REC-24-008931", poliza: "QUA-AU-7710452", cliente: "Transportes del Bajío S.A. de C.V.", aseguradora: "Quálitas", ramo: "Autos Flotilla", fechaPago: "2026-09-21", primaTotal: 284_550.0, comision: 42_682.5, estatus: "conciliado" },
  { folio: "REC-24-008927", poliza: "GNP-GM-1029384", cliente: "María Fernanda López Ruiz", aseguradora: "GNP", ramo: "Gastos Médicos", fechaPago: "2026-09-21", primaTotal: 48_320.4, comision: 7_248.06, estatus: "conciliado" },
  { folio: "REC-24-008922", poliza: "MET-VI-5520193", cliente: "Carlos Andrés Mendoza", aseguradora: "MetLife", ramo: "Vida Individual", fechaPago: "2026-09-20", primaTotal: 22_910.0, comision: 5_727.5, estatus: "diferencia" },
  { folio: "REC-24-008918", poliza: "AXA-DA-3301827", cliente: "Grupo Industrial Norteño", aseguradora: "AXA", ramo: "Daños Empresariales", fechaPago: "2026-09-20", primaTotal: 612_400.0, comision: 73_488.0, estatus: "conciliado" },
  { folio: "REC-24-008915", poliza: "QUA-AU-7709811", cliente: "Roberto Salinas Ortega", aseguradora: "Quálitas", ramo: "Autos Individual", fechaPago: "2026-09-19", primaTotal: 14_875.3, comision: 2_231.3, estatus: "parcial" },
  { folio: "REC-24-008910", poliza: "GNP-VI-2284710", cliente: "Ana Sofía Garza Treviño", aseguradora: "GNP", ramo: "Vida Individual", fechaPago: "2026-09-19", primaTotal: 31_200.0, comision: 7_800.0, estatus: "conciliado" },
  { folio: "REC-24-008904", poliza: "MET-GM-6610024", cliente: "Consultores Asociados MX", aseguradora: "MetLife", ramo: "GMM Colectivo", fechaPago: "2026-09-18", primaTotal: 395_780.9, comision: 39_578.09, estatus: "conciliado" },
  { folio: "REC-24-008899", poliza: "MAP-HG-4471902", cliente: "Luis Alberto Hernández", aseguradora: "Mapfre", ramo: "Hogar", fechaPago: "2026-09-18", primaTotal: 8_640.0, comision: 1_728.0, estatus: "diferencia" },
];
