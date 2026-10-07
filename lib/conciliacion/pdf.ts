import "server-only";

import OpenAI from "openai";

import { normalizarFilasPdf, rescatarJsonTruncado, type LecturaPdf } from "@/lib/conciliacion/pdf-formato";
import { OcrNoConfiguradoError, OcrRespuestaInvalidaError } from "@/lib/ocr/extractor";

const MODELO_PREDETERMINADO = "gpt-4o";
/** Tope de salida del modelo: alcanza para unos 600 renglones. */
const MAX_TOKENS_SALIDA = 16_000;

const INSTRUCCIONES = `Transcribes estados de cuenta de comisiones de aseguradoras mexicanas para conciliarlos contra un CRM.

Devuelve un renglón por cada recibo o pago de comisión que aparezca en el documento, en el mismo orden, como un arreglo de cinco textos:
1. Póliza: el número de póliza tal como está impreso (conserva ceros a la izquierda, guiones y letras; sin espacios).
2. Recibo: el número o consecutivo del recibo tal como aparece (por ejemplo "3" o "3/12"); vacío si no viene.
3. Folio: el folio o número de recibo de la aseguradora (por ejemplo "27872103"); vacío si no viene.
4. Fecha: inicio del periodo que cubre el recibo; si no viene, la fecha de pago o de aplicación. En formato AAAA-MM-DD; vacío si no viene.
5. Comisión: el importe de comisión pagado al agente en ese renglón, con punto decimal y sin separador de miles ni signo de pesos (por ejemplo "1520.40"). Si es una devolución o cargo, con signo menos ("-350.00"). Nunca la prima, el porcentaje de comisión, el IVA ni la retención.

Reglas:
- No inventes renglones ni datos. Si un dato no viene, déjalo vacío ("").
- Omite encabezados, subtítulos, subtotales, totales y pies de página.
- Si la comisión aparece desglosada (comisión, IVA, retenciones, neto), usa la comisión antes de impuestos; si solo hay una columna de importe, usa esa.
- Revisa todas las páginas del documento.

Además devuelve:
- aseguradora: el nombre de la aseguradora impreso en el documento, o null.
- periodo: el periodo del estado de cuenta tal como está impreso (por ejemplo "Septiembre 2026"), o null.
- total_comisiones: el total de comisiones impreso en el documento (el mismo concepto de la columna Comisión), o null si no viene.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["aseguradora", "periodo", "total_comisiones", "renglones"],
  properties: {
    aseguradora: { type: ["string", "null"] },
    periodo: { type: ["string", "null"] },
    total_comisiones: { type: ["number", "null"] },
    renglones: {
      type: "array",
      items: { type: "array", items: { type: "string" } },
    },
  },
} as const;

/**
 * Lee con IA (OpenAI, el mismo proveedor de la Captura Inteligente) la tabla de un estado de cuenta
 * en PDF. El documento no se guarda ni en OpenAI (store: false) ni en el CRM; el usuario revisa
 * lo leído antes de cruzarlo.
 */
export async function leerEstadoDeCuentaPdf(archivo: File, aseguradora?: string): Promise<LecturaPdf> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OcrNoConfiguradoError("Falta la variable de entorno OPENAI_API_KEY.");
  const modelo = process.env.OPENAI_MODEL?.trim() || MODELO_PREDETERMINADO;
  const client = new OpenAI({ apiKey, timeout: 110_000, maxRetries: 0 });

  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
  const response = await client.responses.create({
    model: modelo,
    temperature: 0,
    max_output_tokens: MAX_TOKENS_SALIDA,
    store: false,
    instructions: INSTRUCCIONES,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: aseguradora
              ? `Estado de cuenta de comisiones de ${aseguradora}. Transcribe todos sus renglones.`
              : "Estado de cuenta de comisiones. Transcribe todos sus renglones.",
          },
          {
            type: "input_file",
            filename: archivo.name || "estado-de-cuenta.pdf",
            file_data: `data:application/pdf;base64,${base64}`,
          },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "estado_de_cuenta", strict: true, schema: ESQUEMA } },
  });

  const incompleto = response.status === "incomplete";
  if (incompleto && response.incomplete_details?.reason !== "max_output_tokens") {
    throw new OcrRespuestaInvalidaError(`Respuesta incompleta del modelo (${response.incomplete_details?.reason ?? "desconocido"}).`);
  }
  const texto = response.output_text;
  if (!texto) throw new OcrRespuestaInvalidaError("El modelo no devolvió contenido.");

  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    // Se cortó por el límite de salida: se rescatan los renglones completos.
    json = incompleto ? rescatarJsonTruncado(texto) : null;
    if (!json) throw new OcrRespuestaInvalidaError("El modelo devolvió un JSON inválido.");
  }
  const datos = json as Record<string, unknown>;
  const texto80 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);
  return {
    filas: normalizarFilasPdf(datos.renglones),
    aseguradora: texto80(datos.aseguradora),
    periodo: texto80(datos.periodo),
    totalImpreso: typeof datos.total_comisiones === "number" && Number.isFinite(datos.total_comisiones) ? datos.total_comisiones : null,
    incompleto,
  };
}
