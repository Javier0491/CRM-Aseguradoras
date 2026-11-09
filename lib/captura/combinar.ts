// Cómo se juntan los datos que lee la IA con los de una póliza ya guardada, al renovarla o al
// registrar un endoso. Sin dependencias de React ni de servidor: lo usan la captura y las pruebas.
import type { PolizaFormInicial } from "@/components/captura/poliza-form";

/** Campos que un endoso nunca cambia: la póliza sigue siendo la misma y en la misma vigencia. */
export const CAMPOS_FIJOS_ENDOSO: readonly string[] = ["numeroImpreso", "polizaVigor", "vigenciaInicio", "vigenciaFin"];

/**
 * Renovación: lo que lee la IA de la carátula nueva manda, y lo que no trae se completa con la
 * vigencia anterior (contacto, datos del ramo, asegurados y su antigüedad).
 */
export function combinarRenovacion(ocr: PolizaFormInicial, anterior: PolizaFormInicial): PolizaFormInicial {
  const conValor = (v: Record<string, string> | undefined) =>
    Object.fromEntries(Object.entries(v ?? {}).filter(([, valor]) => valor !== ""));
  const mismoRamo = !ocr.ramo || ocr.ramo === anterior.ramo;
  const antiguedades = new Map((anterior.asegurados ?? []).map((a) => [a.nombre.trim().toUpperCase(), a.antiguedad]));
  return {
    ramo: ocr.ramo ?? anterior.ramo,
    // El número original se conserva en la renovación; la póliza vigor es la que lea la IA (la nueva).
    generales: { ...anterior.generales, ...conValor(ocr.generales), numeroImpreso: anterior.generales?.numeroImpreso ?? "" },
    especificos: mismoRamo ? { ...anterior.especificos, ...conValor(ocr.especificos) } : ocr.especificos,
    asegurados: ocr.asegurados?.length
      ? ocr.asegurados.map((a) => ({ ...a, antiguedad: a.antiguedad || antiguedades.get(a.nombre.trim().toUpperCase()) || "" }))
      : anterior.asegurados,
    sumaAseguradaIlimitada: ocr.sumaAseguradaIlimitada ?? anterior.sumaAseguradaIlimitada,
    // La renovación sigue en la cartera del mismo ejecutivo.
    ejecutivoId: anterior.ejecutivoId,
  };
}

/**
 * Endoso: la póliza endosada que lee la IA actualiza los datos, pero se conservan los campos que un
 * endoso no cambia (número, póliza vigor, vigencia) y los que fijan los recibos cobrados.
 */
export function combinarEndoso(
  ocr: PolizaFormInicial,
  actual: PolizaFormInicial,
  bloqueados: readonly string[]
): PolizaFormInicial {
  const base = combinarRenovacion(ocr, actual);
  const fijos = (v: Record<string, string> | undefined) =>
    Object.fromEntries(Object.entries(v ?? {}).filter(([k]) => bloqueados.includes(k)));
  const ramo = base.ramo ?? actual.ramo;
  return {
    ...base,
    generales: { ...base.generales, ...fijos(actual.generales) },
    // Los campos fijos del ramo (p. ej. el plazo de pago de Vida) solo aplican si no cambió el ramo.
    especificos: ramo === actual.ramo ? { ...base.especificos, ...fijos(actual.especificos) } : base.especificos,
  };
}
