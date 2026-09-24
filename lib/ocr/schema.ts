// Esquema JSON (modo estricto) que la IA debe devolver, generado a partir de las
// mismas definiciones de campos del formulario para que nunca se desincronicen.
import { PARENTESCOS, SEXOS } from "@/lib/polizas/asegurados";
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

/**
 * Todos los campos específicos de todos los ramos, sin duplicar nombres compartidos.
 * Un nombre compartido debe tener el mismo tipo en todos los ramos que lo usan.
 */
function camposEspecificos(): CampoDef[] {
  const porNombre = new Map<string, { campo: CampoDef; ramos: string[] }>();
  for (const ramo of RAMOS) {
    for (const campo of seccionesPorRamo[ramo].flatMap((s) => s.campos)) {
      const previo = porNombre.get(campo.name);
      if (previo) previo.ramos.push(ramoLabels[ramo]);
      else porNombre.set(campo.name, { campo, ramos: [ramoLabels[ramo]] });
    }
  }
  return [...porNombre.values()].map(({ campo, ramos }) => ({
    ...campo,
    label: `${campo.label} (${ramos.join(", ")})`,
  }));
}

export function construirEsquemaExtraccion(aseguradoras: readonly string[]): JsonSchema {
  return {
    type: "object",
    properties: {
      ramo: {
        type: "string",
        enum: RAMOS.map((r) => ramoLabels[r]),
        description: 'Ramo del seguro según el contenido del documento. "Otros" si no hay certeza.',
      },
      generales: objeto(camposGenerales.filter((c) => !c.derivado), aseguradoras),
      especificos: {
        ...objeto(camposEspecificos(), aseguradoras),
        description: "Campos del ramo detectado; los de otros ramos van en null.",
      },
      asegurados_lista: {
        type: "array",
        description:
          "Personas aseguradas en el orden de la carátula. En pólizas de una sola persona " +
          "(Autos, RC), un único elemento con parentesco Titular.",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Nombre completo del asegurado." },
            parentesco: {
              type: "string",
              enum: [...PARENTESCOS],
              description: "Relación con el titular. Otro si no corresponde a ninguna opción.",
            },
            edad: { type: ["integer", "null"], description: "Edad en años. null si no aparece." },
            sexo: { type: ["string", "null"], enum: [...SEXOS, null], description: "null si no aparece." },
            fecha_nacimiento: {
              type: ["string", "null"],
              description: "Fecha de nacimiento en formato YYYY-MM-DD. null si no aparece.",
            },
            antiguedad: {
              type: ["string", "null"],
              description:
                "Antigüedad del asegurado en la aseguradora: fecha en YYYY-MM-DD o el texto impreso. null si no aparece.",
            },
          },
          required: ["nombre", "parentesco", "edad", "sexo", "fecha_nacimiento", "antiguedad"],
          additionalProperties: false,
        },
      },
      referenciaPago: {
        type: ["string", "null"],
        description:
          'Valor del campo "Referencia" o "Referencia de Pago Actual", transcrito carácter por carácter ' +
          "sin espacios (ej. MEDICA00000I12345670). null si no aparece.",
      },
      advertencias: {
        type: "array",
        items: { type: "string" },
        description: "Observaciones breves en español para que el usuario revise.",
      },
    },
    required: ["ramo", "generales", "especificos", "asegurados_lista", "referenciaPago", "advertencias"],
    additionalProperties: false,
  };
}
