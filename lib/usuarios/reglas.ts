// Validación de cuentas del equipo (compartida por el formulario y la Server Action).

export const ROLES = ["ADMIN", "EJECUTIVO"] as const;
export type RolUsuario = (typeof ROLES)[number];

export const rolLabels: Record<RolUsuario, string> = {
  ADMIN: "Administrador",
  EJECUTIVO: "Ejecutivo",
};

export const rolDescripciones: Record<RolUsuario, string> = {
  ADMIN: "Acceso total a la operación: conciliación, configuración y usuarios.",
  EJECUTIVO: "Clientes, pólizas, captura, comunicaciones y reportes; sin conciliación ni configuración.",
};

export const MIN_PASSWORD = 8;
/** bcrypt (lo usa Supabase Auth) ignora lo que pase de 72 bytes. */
export const MAX_PASSWORD = 72;
