// Esquema JSON (modo estricto) que la IA debe devolver, generado a partir de las
// mismas definiciones de campos del formulario para que nunca se desincronicen.
import {
  camposGenerales,
  normalizarOpcion,
  RAMOS,
  ramoLabels,
  seccionesPorRamo,
  type CampoDef,
} from "@/lib/polizas/ramos";

type JsonSchema = Record<string, unknown>;

function describir(campo: CampoDef) {
  const partes = [campo.label];
  if (campo.hint) partes.push(campo.hint);
  if (campo.type === "date") partes.push("Formato YYYY-MM-DD.");
  if (campo.type === "currency") partes.push("Número en MXN sin símbolo ni separadores de miles.");
  if (campo.type === "percent") partes.push("Número entre 0 y 100, sin el símbolo %.");
  if (campo.type === "tel") partes.push("Solo dígitos; 10 dígitos para México.");
  partes.push("null si no aparece o es ilegible.");
  return partes.join(" ");
}

function esquemaCampo(campo: CampoDef, aseguradoras: readonly string[]): JsonSchema {
  const description = describir(campo);

  if (campo.name === "aseguradora") {
    return {
      type: ["string", "null"],
      enum: [...aseguradoras, null],
      description: `${description} Debe ser exactamente uno de los valores permitidos.`,
    };
  }
  if (campo.type === "select" && campo.options?.length) {
    return {
      type: ["string", "null"],
      enum: [...campo.options.map((o) => normalizarOpcion(o).value), null],
      description,
    };
  }
  if (campo.type === "number" || campo.type === "currency" || campo.type === "percent") {
    return { type: ["number", "null"], description };
  }
  return { type: ["string", "null"], description };
}

function objeto(campos: CampoDef[], aseguradoras: readonly string[]): JsonSchema {
  const properties = Object.fromEntries(campos.map((c) => [c.name, esquemaCampo(c, aseguradoras)]));
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/** Todos los campos específicos de todos los ramos (sin duplicar nombres compartidos). */
function camposEspecificos(): CampoDef[] {
  const porNombre = new Map<string, CampoDef>();
  for (const ramo of RAMOS) {
    for (const campo of seccionesPorRamo[ramo].flatMap((s) => s.campos)) {
      if (!porNombre.has(campo.name)) {
        porNombre.set(campo.name, {
          ...campo,
          label: `${campo.label} (${ramoLabels[ramo]})`,
        });
      }
    }
  }
  return [...porNombre.values()];
}

export function construirEsquemaExtraccion(aseguradoras: readonly string[]): JsonSchema {
  return {
    type: "object",
    properties: {
      ramo: {
        type: ["string", "null"],
        enum: [...RAMOS, null],
        description: "Ramo del seguro según la carátula. null si no es posible determinarlo.",
      },
      generales: objeto(camposGenerales.filter((c) => !c.derivado), aseguradoras),
      especificos: {
        ...objeto(camposEspecificos(), aseguradoras),
        description: "Campos del ramo detectado; los de otros ramos van en null.",
      },
      advertencias: {
        type: "array",
        items: { type: "string" },
        description: "Observaciones breves en español para que el usuario revise.",
      },
    },
    required: ["ramo", "generales", "especificos", "advertencias"],
    additionalProperties: false,
  };
}
