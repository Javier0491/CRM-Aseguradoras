// Convierte la salida del modelo en valores listos para el formulario.
// La salida se trata como no confiable: se valida con las mismas reglas del formulario.
import type { ContextoOcr, ExtraccionPoliza } from "@/lib/ocr/types";
import {
  camposGenerales,
  maxLongitud,
  RAMOS,
  RAMOS_CON_CENSO,
  valorSugerido,
  ramoLabels,
  seccionesPorRamo,
  type CampoDef,
  type Ramo,
} from "@/lib/polizas/ramos";
import {
  aseguradoVacio,
  MAX_ASEGURADOS,
  normalizarParentesco,
  SEXOS,
  validarAsegurados,
  type AseguradoValores,
} from "@/lib/polizas/asegurados";
import { extraerPolizaVigor, extraerPolizaVigorDeReferencia } from "@/lib/polizas/polizaParser";
import { normalizarRfc, normalizarTelefono, validarCampo, type Valores } from "@/lib/polizas/validacion";

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const clave = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[\s_]+/g, " ").trim().toLowerCase();

/** La IA responde con la etiqueta ("Vida Grupo"); se acepta también la clave interna. */
function ramoDesdeEtiqueta(valor: string): Ramo | null {
  const buscado = clave(valor);
  return RAMOS.find((r) => clave(ramoLabels[r]) === buscado || clave(r) === buscado) ?? null;
}

function aTexto(campo: CampoDef, valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    return campo.type === "currency" ? valor.toFixed(2) : String(valor);
  }
  if (typeof valor !== "string") return null;
  let v = valor.trim();
  if (!v) return null;
  if (campo.type === "textarea") return v.slice(0, maxLongitud(campo));
  if (campo.name === "rfcCliente" || campo.name === "rfc") v = normalizarRfc(v);
  if (campo.type === "tel") v = normalizarTelefono(v);
  if (campo.type === "email") v = v.toLowerCase();
  if (campo.sugerencias) v = valorSugerido(campo, v);
  return v.slice(0, 500);
}

function extraerCampos(
  fuente: unknown,
  campos: CampoDef[],
  advertencias: string[]
): Valores {
  const src = typeof fuente === "object" && fuente !== null ? (fuente as Record<string, unknown>) : {};
  const out: Valores = {};

  for (const campo of campos) {
    const v = aTexto(campo, src[campo.name]);
    if (v === null) continue;

    const error = validarCampo(campo, v);
    if (!error && campo.sugerencias && !campo.sugerencias.includes(v)) {
      // Se conserva como texto libre, pero se pide revisarla.
      out[campo.name] = v;
      advertencias.push(`${campo.label}: "${v}" no está en el catálogo de la promotoría; verifícala.`);
    } else if (!error) {
      out[campo.name] = v;
    } else if (campo.type === "select" || campo.type === "date") {
      // Un valor fuera de catálogo o una fecha imposible no se puede precargar.
      advertencias.push(`${campo.label}: se descartó el valor detectado "${v}" (${minuscula(error)}).`);
    } else {
      // Se precarga para que el usuario lo corrija; el formulario lo marcará.
      out[campo.name] = v;
      advertencias.push(`${campo.label}: revisa el valor detectado "${v}" (${minuscula(error)}).`);
    }
  }
  return out;
}

/** Lista de asegurados de la IA, en el formato del formulario. */
function extraerAsegurados(fuente: unknown, advertencias: string[]): AseguradoValores[] {
  if (!Array.isArray(fuente)) return [];
  const lista: AseguradoValores[] = [];
  for (const item of fuente.slice(0, MAX_ASEGURADOS)) {
    if (typeof item !== "object" || item === null) continue;
    const src = item as Record<string, unknown>;
    const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

    const nombre = texto(src.nombre).replace(/\s+/g, " ");
    if (!nombre) continue;
    const a = aseguradoVacio();
    a.nombre = nombre;

    const parentesco = normalizarParentesco(texto(src.parentesco));
    a.parentesco = parentesco ?? "Otro";
    if (!parentesco) {
      advertencias.push(`Asegurado ${nombre}: parentesco "${texto(src.parentesco)}" no reconocido; se marcó como Otro.`);
    }

    if (typeof src.edad === "number" && Number.isInteger(src.edad) && src.edad >= 0 && src.edad <= 120) {
      a.edad = String(src.edad);
    } else if (src.edad !== null && src.edad !== undefined) {
      advertencias.push(`Asegurado ${nombre}: se descartó la edad "${String(src.edad)}".`);
    }
    const sexo = texto(src.sexo);
    if ((SEXOS as readonly string[]).includes(sexo)) a.sexo = sexo;
    a.fecha_nacimiento = texto(src.fecha_nacimiento);
    a.antiguedad = texto(src.antiguedad).slice(0, 50);
    lista.push(a);
  }

  // Lo que no pase la validación se precarga igual y se avisa, como con los demás campos.
  const errores = validarAsegurados(lista);
  for (const clave of Object.keys(errores)) {
    const [, i, campo] = clave.split(".");
    if (campo === "fecha_nacimiento") {
      advertencias.push(`Asegurado ${lista[Number(i)].nombre}: se descartó la fecha de nacimiento "${lista[Number(i)].fecha_nacimiento}".`);
      lista[Number(i)].fecha_nacimiento = "";
    } else if (campo === "parentesco") {
      advertencias.push(`Asegurado ${lista[Number(i)].nombre}: ${minuscula(errores[clave])}.`);
    }
  }
  if (fuente.length > MAX_ASEGURADOS) {
    advertencias.push(`La carátula lista más de ${MAX_ASEGURADOS} asegurados; solo se tomaron los primeros.`);
  }
  return lista;
}

export function normalizarExtraccion(
  raw: unknown,
  aseguradoras: readonly string[],
  contexto?: ContextoOcr
): ExtraccionPoliza {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const advertencias = Array.isArray(obj.advertencias)
    ? obj.advertencias.filter((a): a is string => typeof a === "string" && a.trim() !== "").map((a) => a.trim().slice(0, 300)).slice(0, 15)
    : [];

  // Un documento de negociación de GMM Colectivo pertenece a ese ramo aunque la IA dude.
  const ramo =
    contexto === "gmm_colectivo"
      ? "gmm_colectivo"
      : typeof obj.ramo === "string"
        ? ramoDesdeEtiqueta(obj.ramo)
        : null;
  if (ramo === "otros") {
    advertencias.push('La IA clasificó la póliza como "Otros": confirma el ramo antes de guardar.');
  }

  const generalesDefs = camposGenerales
    .filter((c) => !c.derivado && !c.sinOcr)
    .map((c) => (c.name === "aseguradora" ? { ...c, options: aseguradoras } : c));
  const generales = extraerCampos(obj.generales, generalesDefs, advertencias);
  const referenciaPago =
    typeof obj.referenciaPago === "string" && obj.referenciaPago.trim()
      ? obj.referenciaPago.replace(/\s+/g, "").toUpperCase().slice(0, 60)
      : null;

  // La póliza vigor no la calcula la IA: se deriva en código para el cruce de cobranza.
  // Una referencia de pago con el formato esperado SIEMPRE manda, aunque la IA haya
  // leído un número de póliza (suele tomar cualquier número de la carátula). Solo sin
  // referencia válida se deriva del número impreso.
  if (generales.numeroImpreso) generales.numeroImpreso = generales.numeroImpreso.toUpperCase();
  const vigorReferencia = referenciaPago ? extraerPolizaVigorDeReferencia(referenciaPago) : null;

  if (vigorReferencia) {
    generales.polizaVigor = vigorReferencia;
    advertencias.push(
      `Póliza vigor ${vigorReferencia} calculada de la referencia de pago ${referenciaPago}; verifícala.`
    );
  } else {
    if (generales.numeroImpreso) generales.polizaVigor = extraerPolizaVigor(generales.numeroImpreso);
    if (referenciaPago) {
      advertencias.push(
        `La referencia de pago ${referenciaPago} no tiene el formato esperado (letra "I" seguida de ` +
          "dígitos); la póliza vigor no se calculó con ella."
      );
    }
  }

  const especificos = ramo
    ? extraerCampos(obj.especificos, seccionesPorRamo[ramo].flatMap((s) => s.campos), advertencias)
    : {};

  if (!ramo) advertencias.push("No se pudo determinar el ramo; selecciónalo manualmente.");

  // En los ramos con censo los asegurados no se capturan uno por uno.
  const asegurados =
    ramo && RAMOS_CON_CENSO.includes(ramo) ? [] : extraerAsegurados(obj.asegurados_lista, advertencias);

  return { ramo, generales, especificos, referenciaPago, asegurados, advertencias };
}
