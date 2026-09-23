// Catálogos y definición de campos por ramo.
// El formulario de captura se genera a partir de esta configuración, de modo
// que agregar un campo o un ramo nuevo no requiere tocar la UI.

export const RAMOS = ["autos", "gastos_medicos", "vida", "empresarial"] as const;
export type Ramo = (typeof RAMOS)[number];

export const ramoLabels: Record<Ramo, string> = {
  autos: "Autos",
  gastos_medicos: "Gastos Médicos",
  vida: "Vida",
  empresarial: "Empresarial",
};

export const ASEGURADORAS = [
  "Quálitas",
  "GNP",
  "MetLife",
  "AXA",
  "Mapfre",
  "Chubb",
  "HDI",
  "Allianz",
] as const;

export type CampoTipo = "text" | "number" | "currency" | "percent" | "date" | "select";

export type CampoDef = {
  name: string;
  label: string;
  type: CampoTipo;
  required?: boolean;
  placeholder?: string;
  options?: readonly string[];
  hint?: string;
  /** Ocupa las dos columnas del grid. */
  wide?: boolean;
};

export type SeccionDef = {
  titulo: string;
  campos: CampoDef[];
};

/** Datos generales, comunes a cualquier ramo. */
export const camposGenerales: CampoDef[] = [
  { name: "cliente", label: "Cliente / Contratante", type: "text", required: true, placeholder: "Nombre o razón social", wide: true },
  { name: "aseguradora", label: "Aseguradora", type: "select", required: true, options: ASEGURADORAS },
  { name: "numeroPoliza", label: "Número de póliza", type: "text", required: true, placeholder: "Ej. QUA-AU-7710452" },
  { name: "vigenciaInicio", label: "Inicio de vigencia", type: "date", required: true },
  { name: "vigenciaFin", label: "Fin de vigencia", type: "date", required: true },
  { name: "primaTotal", label: "Prima total", type: "currency", required: true, placeholder: "0.00" },
  { name: "formaPago", label: "Forma de pago", type: "select", required: true, options: ["Anual", "Semestral", "Trimestral", "Mensual"] },
];

export const seccionesPorRamo: Record<Ramo, SeccionDef[]> = {
  autos: [
    {
      titulo: "Vehículo",
      campos: [
        { name: "marca", label: "Marca", type: "text", required: true, placeholder: "Ej. Nissan" },
        { name: "modelo", label: "Modelo / Versión", type: "text", required: true, placeholder: "Ej. Versa Advance" },
        { name: "anio", label: "Año", type: "number", required: true, placeholder: "Ej. 2026" },
        { name: "placas", label: "Placas", type: "text", placeholder: "ABC-123-D" },
        { name: "serie", label: "Número de serie (VIN)", type: "text", required: true, placeholder: "17 caracteres", wide: true },
      ],
    },
    {
      titulo: "Cobertura",
      campos: [
        { name: "uso", label: "Uso", type: "select", required: true, options: ["Particular", "Comercial", "Servicio público", "Flotilla"] },
        { name: "cobertura", label: "Paquete", type: "select", required: true, options: ["Amplia", "Limitada", "Responsabilidad Civil"] },
        { name: "deducibleDanos", label: "Deducible daños materiales", type: "percent", placeholder: "Ej. 5" },
        { name: "deducibleRobo", label: "Deducible robo total", type: "percent", placeholder: "Ej. 10" },
      ],
    },
  ],
  gastos_medicos: [
    {
      titulo: "Condiciones del plan",
      campos: [
        { name: "sumaAsegurada", label: "Suma asegurada", type: "currency", required: true, placeholder: "0.00" },
        { name: "deducible", label: "Deducible", type: "currency", required: true, placeholder: "0.00" },
        { name: "coaseguro", label: "Coaseguro", type: "percent", required: true, placeholder: "Ej. 10" },
        { name: "topeCoaseguro", label: "Tope de coaseguro", type: "currency", placeholder: "0.00" },
        { name: "nivelHospitalario", label: "Nivel hospitalario", type: "select", required: true, options: ["Esencial", "Estándar", "Plus", "Premium"] },
        { name: "tipoPlan", label: "Tipo de plan", type: "select", required: true, options: ["Individual", "Familiar", "Colectivo"] },
      ],
    },
    {
      titulo: "Asegurados",
      campos: [
        { name: "numeroAsegurados", label: "Número de asegurados", type: "number", required: true, placeholder: "Ej. 1" },
        { name: "titular", label: "Asegurado titular", type: "text", required: true, placeholder: "Nombre completo" },
        { name: "maternidad", label: "Cobertura de maternidad", type: "select", options: ["Sí", "No"] },
        { name: "emergenciaExtranjero", label: "Emergencia en el extranjero", type: "select", options: ["Sí", "No"] },
      ],
    },
  ],
  vida: [
    {
      titulo: "Plan",
      campos: [
        { name: "plan", label: "Tipo de plan", type: "select", required: true, options: ["Temporal", "Ordinario de vida", "Dotal", "Vida con ahorro"] },
        { name: "sumaAsegurada", label: "Suma asegurada", type: "currency", required: true, placeholder: "0.00" },
        { name: "plazo", label: "Plazo (años)", type: "number", required: true, placeholder: "Ej. 20" },
        { name: "moneda", label: "Moneda", type: "select", required: true, options: ["MXN", "USD", "UDIS"] },
        { name: "fumador", label: "Fumador", type: "select", required: true, options: ["No", "Sí"] },
        { name: "coberturasAdicionales", label: "Coberturas adicionales", type: "text", placeholder: "Ej. Invalidez, muerte accidental", wide: true },
      ],
    },
    {
      titulo: "Beneficiario principal",
      campos: [
        { name: "beneficiario", label: "Nombre del beneficiario", type: "text", required: true, placeholder: "Nombre completo" },
        { name: "parentesco", label: "Parentesco", type: "select", required: true, options: ["Cónyuge", "Hijo(a)", "Padre / Madre", "Hermano(a)", "Otro"] },
        { name: "porcentaje", label: "Porcentaje asignado", type: "percent", required: true, placeholder: "Ej. 100" },
      ],
    },
  ],
  empresarial: [
    {
      titulo: "Empresa",
      campos: [
        { name: "rfc", label: "RFC", type: "text", required: true, placeholder: "12 o 13 caracteres" },
        { name: "giro", label: "Giro / Actividad", type: "text", required: true, placeholder: "Ej. Manufactura de autopartes" },
        { name: "domicilioRiesgo", label: "Domicilio del riesgo", type: "text", required: true, placeholder: "Calle, número, colonia, municipio", wide: true },
        { name: "numeroEmpleados", label: "Número de empleados", type: "number", placeholder: "Ej. 45" },
      ],
    },
    {
      titulo: "Bienes y coberturas",
      campos: [
        { name: "valorEdificio", label: "Valor del edificio", type: "currency", required: true, placeholder: "0.00" },
        { name: "valorContenidos", label: "Valor de contenidos", type: "currency", required: true, placeholder: "0.00" },
        { name: "coberturaPrincipal", label: "Cobertura principal", type: "select", required: true, options: ["Incendio todo riesgo", "Paquete empresarial", "Responsabilidad Civil General", "Transporte de mercancías"] },
        { name: "sumaRC", label: "Suma asegurada RC", type: "currency", placeholder: "0.00" },
      ],
    },
  ],
};
