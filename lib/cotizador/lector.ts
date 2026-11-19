import "server-only";

import OpenAI from "openai";

import type { CoberturasLeidas } from "@/lib/cotizador/igualar";
import {
  EXTRAS,
  FORMAS_PAGO,
  PAQUETES,
  TIPOS_DOCUMENTO_ACTUAL,
  TIPOS_PERSONA,
  VALORES_VEHICULO,
  type FormaPago,
  type RenglonCobertura,
  type TipoDocumentoActual,
  type TipoPersona,
  type ValorVehiculo,
} from "@/lib/cotizador/reglas";
import { OcrNoConfiguradoError, OcrRespuestaInvalidaError } from "@/lib/ocr/extractor";

/** Lo que la IA saca de la INE y la tarjeta de circulación (o factura) para prellenar el formulario. */
export type LecturaDocumentosAuto = {
  vehiculo: {
    anio: number | null;
    marca: string | null;
    modelo: string | null;
    version: string | null;
    transmision: "AUT" | "STD" | null;
    serie: string | null;
    placas: string | null;
  };
  conductor: {
    nombre: string | null;
    fechaNacimiento: string | null;
    sexo: "H" | "M" | null;
    codigoPostal: string | null;
  };
  /** Dueño del vehículo según la tarjeta o factura, si es otro que el conductor. */
  propietario: string | null;
  /** Cosas que el usuario debe revisar (datos ilegibles, dueño distinto, etc.). */
  avisos: string[];
};

const nulo = (tipo: string) => ({ type: [tipo, "null"] });

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vehiculo", "conductor", "propietario", "avisos"],
  properties: {
    vehiculo: {
      type: "object",
      additionalProperties: false,
      required: ["anio", "marca", "modelo", "version", "transmision", "serie", "placas"],
      properties: {
        anio: nulo("integer"),
        marca: nulo("string"),
        modelo: nulo("string"),
        version: nulo("string"),
        transmision: { type: ["string", "null"], enum: ["AUT", "STD", null] },
        serie: nulo("string"),
        placas: nulo("string"),
      },
    },
    conductor: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "fechaNacimiento", "sexo", "codigoPostal"],
      properties: {
        nombre: nulo("string"),
        fechaNacimiento: nulo("string"),
        sexo: { type: ["string", "null"], enum: ["H", "M", null] },
        codigoPostal: nulo("string"),
      },
    },
    propietario: nulo("string"),
    avisos: { type: "array", items: { type: "string" } },
  },
} as const;

const INSTRUCCIONES = `Eres asistente de una agencia de seguros en México. Recibirás fotos o PDF de la identificación
del conductor (INE, licencia o pasaporte) y de los documentos del vehículo (tarjeta de circulación, factura o
refactura). Extrae SOLO lo que se lee en los documentos; si un dato no aparece o no se lee, devuelve null.

- vehiculo.anio: año modelo (en la tarjeta suele decir "MODELO" o "AÑO"). Número de 4 dígitos.
- vehiculo.marca: marca comercial corta, sin razón social (p. ej. "MAZDA", no "Mazda Motor de México S. de R.L.").
- vehiculo.modelo: submarca o línea (p. ej. "MAZDA 3", "AVEO", "VERSA").
- vehiculo.version: la versión tal como viene (p. ej. "I TOURING 4P"). Quita la transmisión de aquí.
- vehiculo.transmision: "AUT" si dice T/A, AUT, automática o CVT; "STD" si dice T/M, STD, estándar o manual.
- vehiculo.serie: número de serie / NIV / VIN de 17 caracteres, sin espacios.
- vehiculo.placas: placas sin guiones.
- conductor.nombre: nombre completo como en la identificación, en orden NOMBRE(S) APELLIDO PATERNO APELLIDO MATERNO.
  En la INE el apellido paterno va primero: reacomódalo.
- conductor.fechaNacimiento: yyyy-mm-dd. En la INE viene como dd/mm/aaaa.
- conductor.sexo: "H" o "M".
- conductor.codigoPostal: 5 dígitos del domicilio de la identificación.
- propietario: el nombre del propietario en la tarjeta o factura, solo si es distinto del conductor.
- avisos: frases cortas en español para el usuario: dueño distinto al conductor (persona moral, etc.), datos
  ilegibles, identificación vencida, documentos que no corresponden a un auto. Lista vacía si no hay nada.`;

/** Manda los documentos a la IA con unas instrucciones y un esquema JSON, y devuelve lo que leyó. */
async function leerConEsquema<T>(
  archivos: File[],
  { instrucciones, esquema, nombre, pedido, maxTokens }: { instrucciones: string; esquema: object; nombre: string; pedido: string; maxTokens: number }
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OcrNoConfiguradoError("Falta la variable de entorno OPENAI_API_KEY.");
  const modelo = process.env.OPENAI_MODEL?.trim() || "gpt-4o";
  const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 });

  const documentos = await Promise.all(
    archivos.map(async (archivo, i) => {
      const dataUrl = `data:${archivo.type};base64,${Buffer.from(await archivo.arrayBuffer()).toString("base64")}`;
      return archivo.type === "application/pdf"
        ? ({ type: "input_file", filename: archivo.name || `documento-${i + 1}.pdf`, file_data: dataUrl } as const)
        : ({ type: "input_image", image_url: dataUrl, detail: "high" } as const);
    })
  );

  const response = await client.responses.create({
    model: modelo,
    temperature: 0,
    max_output_tokens: maxTokens,
    // No conservar en OpenAI los documentos (datos personales).
    store: false,
    instructions: instrucciones,
    input: [{ role: "user", content: [{ type: "input_text", text: pedido }, ...documentos] }],
    text: { format: { type: "json_schema", name: nombre, strict: true, schema: esquema as Record<string, unknown> } },
  });

  if (response.status === "incomplete") throw new OcrRespuestaInvalidaError("Respuesta incompleta del modelo.");
  try {
    return JSON.parse(response.output_text) as T;
  } catch {
    throw new OcrRespuestaInvalidaError("El modelo devolvió un JSON inválido.");
  }
}

/** Lee la identificación y los documentos del vehículo con IA. */
export async function leerDocumentosAuto(archivos: File[]): Promise<LecturaDocumentosAuto> {
  return leerConEsquema<LecturaDocumentosAuto>(archivos, {
    instrucciones: INSTRUCCIONES,
    esquema: ESQUEMA,
    nombre: "documentos_auto",
    pedido: `Extrae los datos para cotizar el seguro de auto (${archivos.length} documentos).`,
    maxTokens: 1500,
  });
}

// ---------------------------------------------------------------------------------------------
// Póliza o cotización que el cliente ya tiene: para igualarla («lo mejor de las dos») y compararla.

/** Lo que la IA saca de la póliza o cotización actual del cliente. */
export type LecturaPolizaAuto = {
  documento: {
    tipoDocumento: TipoDocumentoActual;
    aseguradora: string | null;
    numero: string | null;
    finVigencia: string | null;
    formaPago: FormaPago | null;
    primaTotal: number | null;
    paquete: string | null;
  };
  vehiculo: LecturaDocumentosAuto["vehiculo"] & { valor: ValorVehiculo | null };
  conductor: { nombre: string | null; fechaNacimiento: string | null; sexo: "H" | "M" | null; codigoPostal: string | null };
  tipoPersona: TipoPersona | null;
  coberturas: CoberturasLeidas;
  /** Renglones tal como vienen en el documento. */
  renglones: RenglonCobertura[];
  avisos: string[];
};

const enumNulo = (valores: readonly string[]) => ({ type: ["string", "null"], enum: [...valores, null] });

const ESQUEMA_POLIZA = {
  type: "object",
  additionalProperties: false,
  required: ["documento", "vehiculo", "conductor", "tipoPersona", "coberturas", "renglones", "avisos"],
  properties: {
    documento: {
      type: "object",
      additionalProperties: false,
      required: ["tipoDocumento", "aseguradora", "numero", "finVigencia", "formaPago", "primaTotal", "paquete"],
      properties: {
        tipoDocumento: { type: "string", enum: [...TIPOS_DOCUMENTO_ACTUAL] },
        aseguradora: nulo("string"),
        numero: nulo("string"),
        finVigencia: nulo("string"),
        formaPago: enumNulo(FORMAS_PAGO),
        primaTotal: nulo("number"),
        paquete: nulo("string"),
      },
    },
    vehiculo: {
      type: "object",
      additionalProperties: false,
      required: ["anio", "marca", "modelo", "version", "transmision", "serie", "placas", "valor"],
      properties: {
        anio: nulo("integer"),
        marca: nulo("string"),
        modelo: nulo("string"),
        version: nulo("string"),
        transmision: enumNulo(["AUT", "STD"]),
        serie: nulo("string"),
        placas: nulo("string"),
        valor: enumNulo(VALORES_VEHICULO),
      },
    },
    conductor: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "fechaNacimiento", "sexo", "codigoPostal"],
      properties: {
        nombre: nulo("string"),
        fechaNacimiento: nulo("string"),
        sexo: enumNulo(["H", "M"]),
        codigoPostal: nulo("string"),
      },
    },
    tipoPersona: enumNulo(TIPOS_PERSONA),
    coberturas: {
      type: "object",
      additionalProperties: false,
      required: [
        "paquete",
        "deducibleDM",
        "deducibleRT",
        "responsabilidadCivil",
        "gastosMedicosOcupantes",
        "muerteConductor",
        "rcDanosOcupantes",
        "rcComplementariaPersonas",
        "extras",
      ],
      properties: {
        paquete: enumNulo(PAQUETES),
        deducibleDM: nulo("number"),
        deducibleRT: nulo("number"),
        responsabilidadCivil: nulo("number"),
        gastosMedicosOcupantes: nulo("number"),
        muerteConductor: nulo("number"),
        rcDanosOcupantes: nulo("number"),
        rcComplementariaPersonas: nulo("number"),
        extras: { type: "array", items: { type: "string", enum: Object.keys(EXTRAS) } },
      },
    },
    renglones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cobertura", "sumaAsegurada", "deducible", "prima"],
        properties: { cobertura: { type: "string" }, sumaAsegurada: nulo("string"), deducible: nulo("string"), prima: nulo("number") },
      },
    },
    avisos: { type: "array", items: { type: "string" } },
  },
} as const;

const INSTRUCCIONES_POLIZA = `Eres asistente de una agencia de seguros en México. Recibirás la póliza de auto que el cliente
ya tiene (carátula, especificación de coberturas, recibos) o una cotización de auto de otra aseguradora o agente.
Extrae SOLO lo que se lee; si un dato no aparece, devuelve null. Los montos van como números en pesos, sin "$" ni comas.

documento:
- tipoDocumento: "POLIZA" si es una póliza emitida (tiene número de póliza y vigencia); "COTIZACION" si es una cotización.
- aseguradora: nombre comercial corto (p. ej. "GNP", "AXA", "Qualitas", "HDI", "Chubb", "Mapfre").
- numero: número de póliza o de cotización.
- finVigencia: fecha de fin de vigencia, yyyy-mm-dd (solo pólizas).
- formaPago: CONTADO (anual / pago único), SEMESTRAL, TRIMESTRAL o MENSUAL.
- primaTotal: la PRIMA TOTAL ANUAL con IVA (todos los recibos del año). Si solo ves el primer recibo de un pago
  fraccionado, suma los recibos del año o devuelve null y avísalo.
- paquete: el nombre del paquete como lo llama la aseguradora (p. ej. "Amplia Plus", "Cobertura Amplia").

vehiculo: año, marca corta, modelo (submarca), versión sin la transmisión, transmisión AUT/STD, serie (VIN de 17), placas,
y valor: COMERCIAL, FACTURA o CONVENIDO según la suma asegurada de daños materiales.

conductor: nombre del asegurado o conductor habitual (NOMBRE(S) APELLIDOS), fecha de nacimiento yyyy-mm-dd, sexo H/M y el código postal
del domicilio o de circulación. tipoPersona: FISICA o MORAL (empresa) según el contratante.

coberturas (para igualarlas en otra aseguradora):
- paquete: AMPLIA si tiene daños materiales y robo total; LIMITADA si tiene robo total pero no daños materiales; RC si solo
  tiene responsabilidad civil.
- deducibleDM y deducibleRT: porcentaje (5 para "5%").
- responsabilidadCivil: límite único y combinado de RC en pesos. Si viene separada en bienes y personas, súmalas y avísalo.
  Si viene en UMA o "SMGM", conviértela solo si el documento dice la equivalencia en pesos; si no, null y avísalo.
- gastosMedicosOcupantes: límite único combinado (LUC) de gastos médicos ocupantes en pesos.
- muerteConductor: muerte del conductor por accidente / accidentes automovilísticos al conductor, en pesos.
- rcDanosOcupantes: RC por daños a ocupantes / RC ocupantes, en pesos, solo si está contratada.
- rcComplementariaPersonas: RC complementaria / extensión de RC / RC en exceso, en pesos, solo si está contratada.
- extras: solo los contratados, con estas claves: AUTO_SUSTITUTO (auto sustituto, auto de reemplazo), EXENCION_DEDUCIBLE_PT_DM
  (exención o eliminación de deducible por pérdida total de daños materiales), EXENCION_DEDUCIBLE_RT (exención de deducible por
  robo total), REDUCCION_DEDUCIBLE_RT_SAT (reducción de deducible de robo por localizador satelital), ROBO_PARCIAL, LLANTAS,
  RINES, GASTOS_TRANSPORTE_PT (gastos de transporte por pérdida total), GASTOS_TRANSPORTE_PP (por pérdida parcial),
  AUTO_AGENCIA (reparación en agencia), RC_CRUZADA, ARRASTRE_REMOLQUE, EQUIPO_ESPECIAL, ADAPTACIONES.
  No pongas la asistencia vial, la defensa legal ni las que todas las pólizas traen de fábrica.

renglones: cada cobertura del documento tal como viene (nombre, suma asegurada y deducible como texto, prima como número o null).

avisos: frases cortas en español para el ejecutivo: datos ilegibles, coberturas que no pudiste clasificar (nómbralas para que
las pida a mano), RC separada, vigencia ya vencida, documento que no es de auto. Lista vacía si no hay nada.`;

/** Lee la póliza o cotización actual del cliente con IA. */
export async function leerPolizaAuto(archivos: File[]): Promise<LecturaPolizaAuto> {
  return leerConEsquema<LecturaPolizaAuto>(archivos, {
    instrucciones: INSTRUCCIONES_POLIZA,
    esquema: ESQUEMA_POLIZA,
    nombre: "poliza_auto",
    pedido: `Extrae la póliza o cotización de auto del cliente (${archivos.length} documentos).`,
    maxTokens: 4000,
  });
}
