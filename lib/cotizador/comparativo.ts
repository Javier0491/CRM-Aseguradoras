import type { SolicitudVista } from "@/lib/cotizador/queries";

/** Solicitudes de un mismo envío del multicotizador (o una sola, si se pidió a una aseguradora). */
export type GrupoCotizaciones = { clave: string; solicitudes: SolicitudVista[] };

/** Junta las solicitudes de un mismo envío del multicotizador, conservando el orden de la lista. */
export function agruparSolicitudes(solicitudes: SolicitudVista[]): GrupoCotizaciones[] {
  const grupos: GrupoCotizaciones[] = [];
  const porClave = new Map<string, GrupoCotizaciones>();
  for (const s of solicitudes) {
    const clave = s.grupoId ?? s.id;
    let g = porClave.get(clave);
    if (!g) {
      g = { clave, solicitudes: [] };
      porClave.set(clave, g);
      grupos.push(g);
    }
    g.solicitudes.push(s);
  }
  // Dentro del comparativo: primero las cotizadas, de la más barata a la más cara.
  for (const g of grupos) {
    g.solicitudes.sort(
      (a, b) => (a.resultado?.primaTotal ?? Infinity) - (b.resultado?.primaTotal ?? Infinity) || a.aseguradora.localeCompare(b.aseguradora)
    );
  }
  return grupos;
}
