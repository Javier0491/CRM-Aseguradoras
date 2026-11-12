// Validación de cuentas del equipo (compartida por el formulario y la Server Action).

export const ROLES = ["ADMIN", "EJECUTIVO", "AUXILIAR_COMERCIAL", "OPERACION", "LIDER_OFICINA", "AUXILIAR"] as const;
export type RolUsuario = (typeof ROLES)[number];

export const rolLabels: Record<RolUsuario, string> = {
  ADMIN: "Administrador",
  EJECUTIVO: "Ejecutivo comercial",
  AUXILIAR_COMERCIAL: "Auxiliar comercial",
  OPERACION: "Ejecutiva de operación",
  LIDER_OFICINA: "Líder de oficina",
  AUXILIAR: "Auxiliar",
};

export const rolDescripciones: Record<RolUsuario, string> = {
  ADMIN: "Acceso total: operación, conciliación, configuración y usuarios.",
  EJECUTIVO: "Clientes, pólizas, captura, renovaciones, conciliación de cobranza, comunicaciones y reportes.",
  AUXILIAR_COMERCIAL: "Lo mismo que el Ejecutivo comercial: clientes, pólizas, captura, renovaciones, conciliación de cobranza, comunicaciones y reportes.",
  OPERACION: "Solo Tareas: ve las suyas y marca su parte.",
  LIDER_OFICINA: "Solo Tareas: asigna a todo el equipo, ve el avance de cada quien y puede marcar o borrar cualquiera.",
  AUXILIAR: "Solo Tareas: ve las suyas y marca su parte.",
};

/** Roles que solo usan Tareas: no ven clientes, pólizas, cobranza, comunicaciones ni configuración. */
export const ROLES_SOLO_TAREAS: readonly RolUsuario[] = ["OPERACION", "LIDER_OFICINA", "AUXILIAR"];
export const esRolSoloTareas = (rol: string) => (ROLES_SOLO_TAREAS as readonly string[]).includes(rol);

/**
 * Roles comerciales: Ejecutivo comercial y Auxiliar comercial ven y hacen lo mismo (operación
 * diaria y conciliación de cobranza; sin comisiones, configuración ni usuarios).
 */
export const ROLES_COMERCIALES: readonly RolUsuario[] = ["EJECUTIVO", "AUXILIAR_COMERCIAL"];
export const esRolComercial = (rol: string) => (ROLES_COMERCIALES as readonly string[]).includes(rol);

/** Roles que llevan cartera: pueden ser el ejecutivo de un cliente o de una póliza. */
export const ROLES_CARTERA: readonly RolUsuario[] = ["ADMIN", ...ROLES_COMERCIALES];

export const MIN_PASSWORD = 8;
/** bcrypt (lo usa Supabase Auth) ignora lo que pase de 72 bytes. */
export const MAX_PASSWORD = 72;
