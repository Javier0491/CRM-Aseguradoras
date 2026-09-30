import { formatFecha, formatMoneda } from "@/lib/format";
import { sumarDias } from "@/lib/polizas/gracia";

export const VARIABLES = [
  { clave: "nombre_cliente", label: "Nombre del cliente" },
  { clave: "monto_adeudo", label: "Monto del adeudo" },
  { clave: "fecha_vencimiento", label: "Fecha de vencimiento" },
  { clave: "fecha_limite_pago", label: "Fecha límite de pago (con gracia)" },
  { clave: "dias_gracia", label: "Días de gracia" },
  { clave: "numero_poliza", label: "Número de póliza" },
  { clave: "aseguradora", label: "Aseguradora" },
] as const;

export type VariableClave = (typeof VARIABLES)[number]["clave"];
export type ValoresVariables = Record<VariableClave, string>;

export type Plantilla = {
  id: string;
  nombre: string;
  asunto: string;
  cuerpo: string;
};

export type ReciboCobranza = {
  folio: string;
  poliza: string;
  cliente: string;
  email: string;
  aseguradora: string;
  monto: number;
  fechaVencimiento: string; // ISO yyyy-mm-dd
  /** Días de gracia de la aseguradora (Reglas de cobranza). */
  diasGracia: number;
};

export type Token =
  | { tipo: "texto"; valor: string }
  | { tipo: "variable"; clave: string; valor: string | null };

const PATRON = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export const marcador = (clave: string) => `{{${clave}}}`;

export function valoresDeRecibo(recibo: ReciboCobranza): ValoresVariables {
  return {
    nombre_cliente: recibo.cliente,
    monto_adeudo: formatMoneda(recibo.monto),
    fecha_vencimiento: formatFecha(recibo.fechaVencimiento),
    fecha_limite_pago: formatFecha(sumarDias(recibo.fechaVencimiento, recibo.diasGracia)),
    dias_gracia: `${recibo.diasGracia} ${recibo.diasGracia === 1 ? "día" : "días"}`,
    numero_poliza: recibo.poliza,
    aseguradora: recibo.aseguradora,
  };
}

/** Divide el texto en fragmentos literales y variables (resueltas o no). */
export function tokenizar(texto: string, valores: Partial<Record<string, string>>): Token[] {
  const tokens: Token[] = [];
  let ultimo = 0;
  for (const match of texto.matchAll(PATRON)) {
    const inicio = match.index ?? 0;
    if (inicio > ultimo) tokens.push({ tipo: "texto", valor: texto.slice(ultimo, inicio) });
    const clave = match[1].toLowerCase();
    tokens.push({ tipo: "variable", clave, valor: valores[clave] ?? null });
    ultimo = inicio + match[0].length;
  }
  if (ultimo < texto.length) tokens.push({ tipo: "texto", valor: texto.slice(ultimo) });
  return tokens;
}

/** Sustituye las variables conocidas; las desconocidas se dejan intactas. */
export function renderizar(texto: string, valores: Partial<Record<string, string>>) {
  return tokenizar(texto, valores)
    .map((t) => (t.tipo === "texto" ? t.valor : (t.valor ?? marcador(t.clave))))
    .join("");
}

export function variablesDesconocidas(texto: string): string[] {
  const conocidas = new Set<string>(VARIABLES.map((v) => v.clave));
  const desconocidas = new Set<string>();
  for (const match of texto.matchAll(PATRON)) {
    const clave = match[1].toLowerCase();
    if (!conocidas.has(clave)) desconocidas.add(clave);
  }
  return [...desconocidas];
}
