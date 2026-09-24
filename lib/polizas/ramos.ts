// Catálogos y definición de campos por ramo.
// El formulario de captura se genera a partir de esta configuración, de modo
// que agregar un campo o un ramo nuevo no requiere tocar la UI.

export const RAMOS = [
  "autos",
  "gmm_individual",
  "gmm_colectivo",
  "vida_individual",
  "vida_grupo",
  "danos",
  "rc_profesional",
  "hogar",
  "otros",
] as const;
export type Ramo = (typeof RAMOS)[number];

/** Valor del enum `Ramo` en la base de datos para cada ramo del formulario. */
export const RAMO_DB = {
  autos: "AUTOS",
  gmm_individual: "GMM_INDIVIDUAL",
  gmm_colectivo: "GMM_COLECTIVO",
  vida_individual: "VIDA_INDIVIDUAL",
  vida_grupo: "VIDA_GRUPO",
  danos: "DANOS",
  rc_profesional: "RC_PROFESIONAL",
  hogar: "HOGAR",
  otros: "OTROS",
} as const satisfies Record<Ramo, string>;

export const ramoDesdeDb = (valor: string): Ramo | null =>
  RAMOS.find((r) => RAMO_DB[r] === valor) ?? null;

// Estas etiquetas son también las opciones con las que la IA clasifica el ramo.
export const ramoLabels: Record<Ramo, string> = {
  autos: "Autos",
  gmm_individual: "GMM Individual",
  gmm_colectivo: "GMM Colectivo",
  vida_individual: "Vida Individual",
  vida_grupo: "Vida Grupo",
  danos: "Daños",
  rc_profesional: "RC Profesional",
  hogar: "Hogar",
  otros: "Otros",
};

export const FORMAS_PAGO = [
  { value: "ANUAL", label: "Anual", meses: 12 },
  { value: "SEMESTRAL", label: "Semestral", meses: 6 },
  { value: "TRIMESTRAL", label: "Trimestral", meses: 3 },
  { value: "MENSUAL", label: "Mensual", meses: 1 },
] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number]["value"];

export type CampoTipo =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "select"
  | "email"
  | "tel";

/** Longitud máxima de un campo de texto largo (textarea); el resto admite 500. */
export const MAX_TEXTO_LARGO = 4000;
export const maxLongitud = (campo: CampoDef) => (campo.type === "textarea" ? MAX_TEXTO_LARGO : 500);

/**
 * Ramos cuyos asegurados se manejan con un censo poblacional externo:
 * no se capturan nombre por nombre.
 */
export const RAMOS_CON_CENSO: readonly Ramo[] = ["gmm_colectivo"];

export type Opcion = { value: string; label: string };

export type CampoDef = {
  name: string;
  label: string;
  type: CampoTipo;
  required?: boolean;
  placeholder?: string;
  /** Un string se usa como valor y etiqueta a la vez. */
  options?: readonly (string | Opcion)[];
  hint?: string;
  /** Ocupa las dos columnas del grid. */
  wide?: boolean;
  /** Se calcula a partir de otro campo: la IA no lo extrae. */
  derivado?: boolean;
};

export type SeccionDef = {
  titulo: string;
  campos: CampoDef[];
};

export const normalizarOpcion = (o: string | Opcion): Opcion =>
  typeof o === "string" ? { value: o, label: o } : o;

/**
 * Datos generales, comunes a cualquier ramo.
 * Las opciones de "aseguradora" se inyectan en runtime desde la base de datos.
 */
export const camposGenerales: CampoDef[] = [
  { name: "cliente", label: "Cliente / Contratante", type: "text", required: true, placeholder: "Nombre o razón social", wide: true },
  { name: "rfcCliente", label: "RFC del cliente", type: "text", required: true, placeholder: "12 o 13 caracteres", hint: "Se usa para identificar al cliente si ya existe." },
  { name: "telefono", label: "Teléfono", type: "tel", required: true, placeholder: "10 dígitos" },
  { name: "email", label: "Correo electrónico", type: "email", required: true, placeholder: "cliente@correo.mx", wide: true },
  { name: "aseguradora", label: "Aseguradora", type: "select", required: true, options: [] },
  { name: "numeroImpreso", label: "Número impreso", type: "text", required: true, placeholder: "Ej. AUT-987654-03", hint: "Tal como aparece en la carátula." },
  { name: "polizaVigor", label: "Póliza vigor", type: "text", required: true, placeholder: "Ej. 987654", hint: "Clave de cobranza; se calcula desde el número impreso.", derivado: true },
  { name: "vigenciaInicio", label: "Inicio de vigencia", type: "date", required: true },
  { name: "vigenciaFin", label: "Fin de vigencia", type: "date", required: true },
  { name: "primaTotal", label: "Prima total", type: "currency", required: true, placeholder: "0.00", hint: "Prima de toda la vigencia; se reparte entre los recibos." },
  { name: "formaPago", label: "Forma de pago", type: "select", required: true, options: FORMAS_PAGO.map(({ value, label }) => ({ value, label })) },
];

// Comunes a GMM Individual y Colectivo.
const CONDICIONES_GMM: CampoDef[] = [
  { name: "sumaAsegurada", label: "Suma asegurada", type: "currency", required: true, placeholder: "0.00" },
  { name: "deducible", label: "Deducible", type: "currency", required: true, placeholder: "0.00" },
  { name: "coaseguro", label: "Coaseguro", type: "percent", required: true, placeholder: "Ej. 10" },
  { name: "topeCoaseguro", label: "Tope de coaseguro", type: "currency", placeholder: "0.00" },
  { name: "nivelHospitalario", label: "Nivel hospitalario", type: "select", required: true, options: ["Esencial", "Estándar", "Plus", "Premium"] },
];
const COBERTURAS_GMM: CampoDef[] = [
  { name: "maternidad", label: "Cobertura de maternidad", type: "select", options: ["Sí", "No"] },
  { name: "emergenciaExtranjero", label: "Emergencia en el extranjero", type: "select", options: ["Sí", "No"] },
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
  gmm_individual: [
    {
      titulo: "Condiciones del plan",
      campos: [
        ...CONDICIONES_GMM,
        { name: "tipoPlan", label: "Tipo de plan", type: "select", required: true, options: ["Individual", "Familiar"] },
      ],
    },
    { titulo: "Coberturas adicionales", campos: COBERTURAS_GMM },
  ],
  gmm_colectivo: [
    { titulo: "Condiciones del plan", campos: CONDICIONES_GMM },
    { titulo: "Coberturas adicionales", campos: COBERTURAS_GMM },
    {
      titulo: "Subgrupo",
      campos: [
        {
          name: "condicionesSubgrupo",
          label: "Condiciones del Subgrupo / Reglas",
          type: "textarea",
          wide: true,
          placeholder: "Suma asegurada, deducible, coaseguro y coberturas principales de cada subgrupo",
          hint: "Resumen de las reglas del plan; la IA lo llena desde el formato de negociación u orden de emisión.",
        },
      ],
    },
  ],
  vida_individual: [
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
  vida_grupo: [
    {
      titulo: "Colectivo",
      campos: [
        { name: "numeroAsegurados", label: "Número de asegurados", type: "number", required: true, placeholder: "Ej. 120" },
        { name: "reglaSuma", label: "Regla de suma asegurada", type: "select", required: true, options: ["Uniforme", "Múltiplo de sueldo", "Por categoría"] },
        { name: "sumaAsegurada", label: "Suma asegurada por asegurado", type: "currency", required: true, placeholder: "0.00", hint: "Si varía por asegurado, captura el promedio." },
        { name: "moneda", label: "Moneda", type: "select", required: true, options: ["MXN", "USD", "UDIS"] },
        { name: "coberturasAdicionales", label: "Coberturas adicionales", type: "text", placeholder: "Ej. Invalidez, muerte accidental", wide: true },
      ],
    },
  ],
  danos: [
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
  rc_profesional: [
    {
      titulo: "Cobertura",
      campos: [
        { name: "profesion", label: "Profesión / Actividad", type: "text", required: true, placeholder: "Ej. Médico cirujano" },
        { name: "cedulaProfesional", label: "Cédula profesional", type: "text", placeholder: "Ej. 1234567" },
        { name: "sumaAsegurada", label: "Suma asegurada", type: "currency", required: true, placeholder: "0.00" },
        { name: "deducible", label: "Deducible", type: "currency", placeholder: "0.00" },
        { name: "coberturaTerritorial", label: "Cobertura territorial", type: "select", options: ["Nacional", "Extranjero", "Mundial"] },
      ],
    },
  ],
  hogar: [
    {
      titulo: "Inmueble",
      campos: [
        { name: "domicilioRiesgo", label: "Domicilio del riesgo", type: "text", required: true, placeholder: "Calle, número, colonia, municipio", wide: true },
        { name: "tipoVivienda", label: "Tipo de vivienda", type: "select", required: true, options: ["Casa", "Departamento", "Casa en condominio"] },
        { name: "usoVivienda", label: "Uso", type: "select", required: true, options: ["Habitada por el propietario", "Rentada a terceros", "Casa de descanso"] },
      ],
    },
    {
      titulo: "Coberturas",
      campos: [
        { name: "valorConstruccion", label: "Valor de la construcción", type: "currency", required: true, placeholder: "0.00" },
        { name: "valorContenidos", label: "Valor de contenidos", type: "currency", required: true, placeholder: "0.00" },
        { name: "sumaRC", label: "Suma asegurada RC familiar", type: "currency", placeholder: "0.00" },
        { name: "deducibleInmueble", label: "Deducible", type: "percent", placeholder: "Ej. 2" },
      ],
    },
  ],
  otros: [
    {
      titulo: "Detalle",
      campos: [
        { name: "descripcionRiesgo", label: "Tipo de seguro / riesgo cubierto", type: "text", required: true, placeholder: "Ej. Seguro de mascotas", wide: true },
        { name: "sumaAsegurada", label: "Suma asegurada", type: "currency", placeholder: "0.00" },
      ],
    },
  ],
};
