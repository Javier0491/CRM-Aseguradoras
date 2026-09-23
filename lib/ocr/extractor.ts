import "server-only";

import OpenAI from "openai";

import { normalizarExtraccion } from "@/lib/ocr/normalizar";
import { construirSystemPrompt } from "@/lib/ocr/prompt";
import { construirEsquemaExtraccion } from "@/lib/ocr/schema";
import type { ExtraccionPoliza } from "@/lib/ocr/types";

/** Contrato de cualquier motor de extracción de carátulas. */
export interface ExtractorPoliza {
  proveedor: string;
  modelo: string;
  extraer(archivo: File, aseguradoras: readonly string[]): Promise<ExtraccionPoliza>;
}

/** La extracción no está disponible por configuración (p. ej. falta la API key). */
export class OcrNoConfiguradoError extends Error {}

/** El modelo no devolvió una respuesta utilizable. */
export class OcrRespuestaInvalidaError extends Error {}

const MODELO_PREDETERMINADO = "gpt-4o";

function crearExtractorOpenAI(apiKey: string, modelo: string): ExtractorPoliza {
  const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 });

  return {
    proveedor: "openai",
    modelo,
    async extraer(archivo, aseguradoras) {
      const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
      const dataUrl = `data:${archivo.type};base64,${base64}`;

      const documento =
        archivo.type === "application/pdf"
          ? ({ type: "input_file", filename: archivo.name || "caratula.pdf", file_data: dataUrl } as const)
          : ({ type: "input_image", image_url: dataUrl, detail: "high" } as const);

      const response = await client.responses.create({
        model: modelo,
        temperature: 0,
        max_output_tokens: 3000,
        // No conservar en OpenAI las carátulas (contienen datos personales).
        store: false,
        instructions: construirSystemPrompt(aseguradoras),
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Extrae los datos de esta carátula de póliza." },
              documento,
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "extraccion_poliza",
            strict: true,
            schema: construirEsquemaExtraccion(aseguradoras),
          },
        },
      });

      if (response.status === "incomplete") {
        throw new OcrRespuestaInvalidaError(
          `Respuesta incompleta del modelo (${response.incomplete_details?.reason ?? "desconocido"}).`
        );
      }

      const texto = response.output_text;
      if (!texto) throw new OcrRespuestaInvalidaError("El modelo no devolvió contenido.");

      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new OcrRespuestaInvalidaError("El modelo devolvió un JSON inválido.");
      }
      return normalizarExtraccion(json, aseguradoras);
    },
  };
}

export function getExtractor(): ExtractorPoliza {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OcrNoConfiguradoError("Falta la variable de entorno OPENAI_API_KEY.");
  }
  const modelo = process.env.OPENAI_MODEL?.trim() || MODELO_PREDETERMINADO;
  return crearExtractorOpenAI(apiKey, modelo);
}
