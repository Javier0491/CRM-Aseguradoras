// «Lo mejor de las dos»: cuando el cliente ya tiene póliza (o una cotización de otro lado), se cotiza
// con cada cobertura en lo más alto entre su póliza y el paquete básico de la agencia, los deducibles
// en lo más bajo, sus extras conservados y la bonificación máxima. Así el cliente nunca queda con
// menos de lo que ya tiene. Lo decidió el dueño el 2026-11-19.
//
// Sin dependencias del servidor: lo usa el formulario y se prueba aparte.

import {
  DEDUCIBLES_DM,
  DEDUCIBLES_RT,
  ETIQUETA_PAQUETE,
  EXTRAS,
  PAQUETES,
  SUMAS_AUTO,
  type CampoSumaAuto,
  type DatosCotizacionAuto,
  type Extra,
  type Paquete,
} from "@/lib/cotizador/reglas";

type Coberturas = DatosCotizacionAuto["coberturas"];

/** Coberturas que la IA leyó del documento del cliente; null = no viene o no se leyó. */
export type CoberturasLeidas = {
  paquete: Paquete | null;
  deducibleDM: number | null;
  deducibleRT: number | null;
  responsabilidadCivil: number | null;
  gastosMedicosOcupantes: number | null;
  muerteConductor: number | null;
  rcDanosOcupantes: number | null;
  rcComplementariaPersonas: number | null;
  extras: Extra[];
};

export type Igualacion = {
  coberturas: Coberturas;
  /** Qué se hizo con cada cobertura, en palabras para el ejecutivo. */
  cambios: string[];
};

const ETIQUETA: Record<CampoSumaAuto, string> = {
  responsabilidadCivil: "Responsabilidad civil",
  gastosMedicosOcupantes: "Gastos médicos ocupantes",
  muerteConductor: "Muerte del conductor",
  rcDanosOcupantes: "RC daños a ocupantes",
  rcComplementariaPersonas: "RC complementaria personas",
};

const pesos = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 2 })} millones` : `$${n.toLocaleString("es-MX")}`;

/** La opción del formulario igual o mayor a `n` (o la mayor que exista). */
function haciaArriba(n: number, opciones: readonly number[]): number {
  return opciones.find((o) => o >= n) ?? opciones[opciones.length - 1];
}

/** La opción igual o menor a `n` (o la menor que exista). */
function haciaAbajo(n: number, opciones: readonly number[]): number {
  return [...opciones].reverse().find((o) => o <= n) ?? opciones[0];
}

const rango = (p: Paquete) => PAQUETES.length - PAQUETES.indexOf(p); // AMPLIA 3 > LIMITADA 2 > RC 1

export function loMejorDeLasDos(basico: Coberturas, poliza: CoberturasLeidas): Igualacion {
  const cambios: string[] = [];
  const k: Coberturas = { ...basico, extras: [...basico.extras], bonificacionMaxima: true };

  // Paquete: el más completo.
  if (poliza.paquete && rango(poliza.paquete) > rango(basico.paquete)) {
    k.paquete = poliza.paquete;
    cambios.push(`Paquete ${ETIQUETA_PAQUETE[poliza.paquete]}, como su póliza.`);
  } else if (poliza.paquete && poliza.paquete !== basico.paquete) {
    cambios.push(`Paquete: su póliza es ${ETIQUETA_PAQUETE[poliza.paquete]}; cotizamos ${ETIQUETA_PAQUETE[basico.paquete]} (nuestro básico, más completo).`);
  }

  // Deducibles: el más bajo.
  const deducible = (campo: "deducibleDM" | "deducibleRT", opciones: readonly number[], nombre: string) => {
    const suyo = poliza[campo];
    if (suyo === null) return;
    const objetivo = Math.min(suyo, basico[campo]);
    const elegido = haciaAbajo(objetivo, opciones);
    k[campo] = elegido;
    if (suyo < opciones[0]) {
      cambios.push(`${nombre}: su póliza trae ${suyo}%; lo más bajo que se puede pedir es ${elegido}%.`);
    } else if (elegido < basico[campo]) {
      cambios.push(`${nombre} ${elegido}%, como su póliza (nuestro básico es ${basico[campo]}%).`);
    } else if (suyo > elegido) {
      cambios.push(`${nombre} ${elegido}% (nuestro básico; su póliza trae ${suyo}%).`);
    }
  };
  deducible("deducibleDM", DEDUCIBLES_DM, "Deducible de daños materiales");
  deducible("deducibleRT", DEDUCIBLES_RT, "Deducible de robo total");

  // Sumas aseguradas: la más alta, redondeada hacia arriba a una opción que exista.
  for (const campo of Object.keys(SUMAS_AUTO) as CampoSumaAuto[]) {
    const suya = poliza[campo];
    const nuestra = basico[campo];
    if (suya === null || suya <= 0) continue;
    const opciones = SUMAS_AUTO[campo];
    const elegida = haciaArriba(Math.max(suya, nuestra ?? 0), opciones);
    k[campo] = elegida;
    if (suya > opciones[opciones.length - 1]) {
      cambios.push(`${ETIQUETA[campo]}: su póliza trae ${pesos(suya)}; lo más alto que se puede pedir es ${pesos(elegida)}.`);
    } else if (nuestra !== null && nuestra > suya) {
      cambios.push(`${ETIQUETA[campo]} ${pesos(elegida)} (nuestro básico; su póliza trae ${pesos(suya)}).`);
    } else if (nuestra === null || elegida > nuestra) {
      cambios.push(`${ETIQUETA[campo]} ${pesos(elegida)}, como su póliza${elegida !== suya ? ` (trae ${pesos(suya)})` : ""}.`);
    }
  }

  // Extras: se conservan los que ya tenía.
  const nuevos = poliza.extras.filter((x) => !k.extras.includes(x));
  if (nuevos.length) {
    k.extras = [...k.extras, ...nuevos];
    cambios.push(`Se conservan sus extras: ${nuevos.map((x) => EXTRAS[x]).join(", ")}.`);
  }

  cambios.push("Con la bonificación técnica máxima de cada aseguradora.");
  return { coberturas: k, cambios };
}

/**
 * Ahorro del cliente contra lo que paga hoy, comparando la misma forma de pago (la cotizada o, si el
 * documento trae otra, la de `otrasFormasPago`). Si no hay con qué comparar, null.
 * Positivo = ahorra; negativo = le sale más caro.
 */
export function ahorroContraActual(
  actual: { primaTotal: number | null; formaPago: string | null } | null | undefined,
  nuestra: { primaTotal: number; formaPago: string; otrasFormasPago?: { formaPago: string; primaTotal: number }[] } | null | undefined
): { monto: number; porcentaje: number } | null {
  if (!actual?.primaTotal || !nuestra) return null;
  const precio =
    !actual.formaPago || actual.formaPago === nuestra.formaPago
      ? nuestra.primaTotal
      : nuestra.otrasFormasPago?.find((o) => o.formaPago === actual.formaPago)?.primaTotal;
  if (precio === undefined) return null;
  const monto = Math.round((actual.primaTotal - precio) * 100) / 100;
  return { monto, porcentaje: Math.round((monto / actual.primaTotal) * 1000) / 10 };
}
