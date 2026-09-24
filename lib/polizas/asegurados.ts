// Asegurados de una póliza: catálogos, normalización y validación compartidos por el
// formulario (cliente), la Server Action y el normalizador del OCR.

export const PARENTESCOS = ["Titular", "Conyuge", "Padre", "Madre", "Hijo", "Otro"] as const;
export type Parentesco = (typeof PARENTESCOS)[number];

export const parentescoLabels: Record<Parentesco, string> = {
  Titular: "Titular",
  Conyuge: "Cónyuge",
  Padre: "Padre",
  Madre: "Madre",
  Hijo: "Hijo(a)",
  Otro: "Otro",
};

export const SEXOS = ["Masculino", "Femenino"] as const;

/** Un asegurado tal como lo maneja el formulario: todo en texto. */
export type AseguradoValores = {
  nombre: string;
  parentesco: string;
  edad: string;
  sexo: string;
  fecha_nacimiento: string;
  antiguedad: string;
};

export const CAMPOS_ASEGURADO = [
  "nombre",
  "parentesco",
  "edad",
  "sexo",
  "fecha_nacimiento",
  "antiguedad",
] as const satisfies readonly (keyof AseguradoValores)[];

export const MAX_ASEGURADOS = 200;

export const aseguradoVacio = (parentesco: string = ""): AseguradoValores => ({
  nombre: "",
  parentesco,
  edad: "",
  sexo: "",
  fecha_nacimiento: "",
  antiguedad: "",
});

const sinAcentos = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/** Acepta variantes comunes de las carátulas ("Esposa", "Hija", "Cónyuge"…). */
export function normalizarParentesco(valor: string): Parentesco | null {
  const v = sinAcentos(valor);
  if (!v) return null;
  if (["titular", "asegurado titular", "contratante"].includes(v)) return "Titular";
  if (["conyuge", "esposo", "esposa", "concubino", "concubina"].includes(v)) return "Conyuge";
  if (v === "padre") return "Padre";
  if (v === "madre") return "Madre";
  if (["hijo", "hija", "hijo(a)", "hijos"].includes(v)) return "Hijo";
  if (v === "otro" || v === "otra") return "Otro";
  return null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
function esFechaValida(v: string) {
  if (!FECHA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

/**
 * Valida la lista. Las claves del resultado usan la ruta del formulario,
 * p. ej. "asegurados.2.nombre".
 */
export function validarAsegurados(asegurados: readonly AseguradoValores[]): Record<string, string> {
  const errores: Record<string, string> = {};
  const error = (i: number, campo: keyof AseguradoValores, msg: string) => {
    errores[`asegurados.${i}.${campo}`] = msg;
  };

  if (asegurados.length > MAX_ASEGURADOS) {
    errores.asegurados = `Máximo ${MAX_ASEGURADOS} asegurados por póliza.`;
  }

  let titulares = 0;
  asegurados.forEach((a, i) => {
    if (!a.nombre.trim()) error(i, "nombre", "Campo obligatorio");
    if (!(PARENTESCOS as readonly string[]).includes(a.parentesco)) {
      error(i, "parentesco", "Selecciona el parentesco");
    } else if (a.parentesco === "Titular" && ++titulares > 1) {
      error(i, "parentesco", "Solo puede haber un titular");
    }
    const edad = a.edad.trim();
    if (edad && (!/^\d{1,3}$/.test(edad) || Number(edad) > 120)) error(i, "edad", "Edad inválida");
    if (a.sexo && !(SEXOS as readonly string[]).includes(a.sexo)) error(i, "sexo", "Selecciona una opción válida");
    if (a.fecha_nacimiento && !esFechaValida(a.fecha_nacimiento)) error(i, "fecha_nacimiento", "Fecha inválida");
    if (a.antiguedad.length > 50) error(i, "antiguedad", "Máximo 50 caracteres");
  });
  return errores;
}

/**
 * Normaliza una lista no confiable (payload del cliente): solo conserva los campos
 * conocidos, como strings recortados. Devuelve null si la forma es inválida.
 */
export function sanitizarAsegurados(raw: unknown): AseguradoValores[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ASEGURADOS) return null;
  const lista: AseguradoValores[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const src = item as Record<string, unknown>;
    const a = aseguradoVacio();
    for (const campo of CAMPOS_ASEGURADO) {
      const v = src[campo];
      if (v === undefined || v === null) continue;
      if (typeof v !== "string") return null;
      a[campo] = v.trim().slice(0, 200);
    }
    lista.push(a);
  }
  return lista;
}
