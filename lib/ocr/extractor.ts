import "server-only";

import OpenAI from "openai";

import { normalizarExtraccion } from "@/lib/ocr/normalizar";
import { construirSystemPrompt } from "@/lib/ocr/prompt";
import { construirEsquemaExtraccion } from "@/lib/ocr/schema";
import type { ContextoOcr, ExtraccionPoliza } from "@/lib/ocr/types";

/** Contrato de cualquier motor de extracción de carátulas. */
export interface ExtractorPoliza {
  proveedor: string;
  modelo: string;
  /** Lee uno o varios documentos de la misma póliza y devuelve una sola extracción. */
  extraer(archivos: File[], aseguradoras: readonly string[], contexto?: ContextoOcr): Promise<ExtraccionPoliza>;
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
    async extraer(archivos, aseguradoras, contexto) {
      const documentos = await Promise.all(
        archivos.map(async (archivo, i) => {
          const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
          const dataUrl = `data:${archivo.type};base64,${base64}`;
          return archivo.type === "application/pdf"
            ? ({ type: "input_file", filename: archivo.name || `documento-${i + 1}.pdf`, file_data: dataUrl } as const)
            : ({ type: "input_image", image_url: dataUrl, detail: "high" } as const);
        })
      );

      const varios = archivos.length > 1;
      const indicacion =
        contexto === "gmm_colectivo"
          ? "Extrae los datos de este formato de negociación u orden de emisión de GMM Colectivo."
          : "Extrae los datos de esta carátula de póliza.";

      const response = await client.responses.create({
        model: modelo,
        temperature: 0,
        max_output_tokens: 4000,
        // No conservar en OpenAI las carátulas (contienen datos personales).
        store: false,
        instructions: construirSystemPrompt(aseguradoras, contexto),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: varios
                  ? `${indicacion} Recibirás ${archivos.length} documentos de la MISMA póliza (${archivos
                      .map((a, i) => `${i + 1}. "${a.name}"`)
                      .join(", ")}); cruza sus datos y devuelve un solo JSON consolidado.`
                  : indicacion,
              },
              ...documentos,
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
      return normalizarExtraccion(json, aseguradoras, contexto);
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
