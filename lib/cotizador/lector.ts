import "server-only";

import OpenAI from "openai";

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

/** Lee la identificación y los documentos del vehículo con IA. */
export async function leerDocumentosAuto(archivos: File[]): Promise<LecturaDocumentosAuto> {
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
    max_output_tokens: 1500,
    // No conservar en OpenAI las identificaciones (datos personales).
    store: false,
    instructions: INSTRUCCIONES,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: `Extrae los datos para cotizar el seguro de auto (${archivos.length} documentos).` }, ...documentos],
      },
    ],
    text: { format: { type: "json_schema", name: "documentos_auto", strict: true, schema: ESQUEMA } },
  });

  if (response.status === "incomplete") throw new OcrRespuestaInvalidaError("Respuesta incompleta del modelo.");
  try {
    return JSON.parse(response.output_text) as LecturaDocumentosAuto;
  } catch {
    throw new OcrRespuestaInvalidaError("El modelo devolvió un JSON inválido.");
  }
}
