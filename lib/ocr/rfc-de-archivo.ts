// Los portales nombran las facturas y avisos de cobro con el RFC del cliente
// ("FACT_GUAH810713A3A_77605195_…", "AVISO_MOIP8807062C0_…"). Cuando la lectura no trae el RFC,
// o trae uno genérico (algunos recibos salen a "público en general"), se toma de ahí.
import { RFC_GENERICOS } from "@/lib/clientes/reglas";
import type { ExtraccionPoliza } from "@/lib/ocr/types";
import { normalizarRfc, rfcValido } from "@/lib/polizas/validacion";

/** Un RFC completo (con homoclave) entre separadores del nombre. */
const RFC_EN_NOMBRE = /(?:^|[_\-\s.])([A-ZÑ&]{3,4}\d{6}[A-Z\d]{3})(?=[_\-\s.]|$)/giu;

/**
 * Primer RFC válido y no genérico en los nombres de archivo. En una ruta cuenta cada parte (p. ej.
 * el ZIP "FACT_…zip" que contiene el PDF), de la más cercana al archivo a la más lejana.
 */
export function rfcDeNombres(nombres: readonly string[]): { rfc: string; archivo: string } | null {
  for (const ruta of nombres) {
    for (const archivo of ruta.split("/").reverse()) {
      for (const m of archivo.toUpperCase().matchAll(RFC_EN_NOMBRE)) {
        const rfc = normalizarRfc(m[1]);
        if (rfcValido(rfc) && !RFC_GENERICOS.has(rfc)) return { rfc, archivo };
      }
    }
  }
  return null;
}

/**
 * Completa el RFC del contratante con el de los nombres de archivo si la lectura no lo trajo o
 * trajo uno genérico, y lo anota en las advertencias para que se revise.
 */
export function completarRfcDesdeArchivos(datos: ExtraccionPoliza, nombres: readonly string[]): ExtraccionPoliza {
  const leido = normalizarRfc(datos.generales.rfcCliente ?? "");
  if (leido && !RFC_GENERICOS.has(leido)) return datos;
  const hallado = rfcDeNombres(nombres);
  if (!hallado) return datos;
  return {
    ...datos,
    generales: { ...datos.generales, rfcCliente: hallado.rfc },
    advertencias: [
      ...datos.advertencias,
      `RFC tomado del nombre del archivo «${hallado.archivo}»${leido ? ` (el documento traía el genérico ${leido})` : ""}.`,
    ],
  };
}
