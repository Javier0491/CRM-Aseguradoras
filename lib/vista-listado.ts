// Cómo se muestran los listados que se pueden ver en tarjetas o en lista (clientes, pólizas). La
// elección se guarda en una cookie por listado: se recuerda en las siguientes visitas y el
// servidor pinta directamente la vista elegida.

export const VISTAS_LISTADO = ["tarjetas", "lista"] as const;
export type VistaListado = (typeof VISTAS_LISTADO)[number];
export type ListadoConVista = "clientes" | "polizas";

/** Sin elección guardada, los listados se ven en tarjetas. */
export const VISTA_PREDETERMINADA: VistaListado = "tarjetas";

export const cookieVista = (listado: ListadoConVista) => `vista_${listado}`;

export const vistaDe = (valor: unknown): VistaListado =>
  (VISTAS_LISTADO as readonly unknown[]).includes(valor) ? (valor as VistaListado) : VISTA_PREDETERMINADA;
