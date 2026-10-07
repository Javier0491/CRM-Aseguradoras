// Contrato del almacenamiento de archivos de pólizas. La base de datos solo guarda la clave
// del objeto ({polizaId}/{uuid}.{ext}); cualquier proveedor que cumpla esto es intercambiable.

export type SubidaFirmada = {
  /** URL a la que el navegador sube el archivo con PUT (sin pasar por el servidor de Next). */
  url: string;
  /** Encabezados que la subida debe enviar tal cual (forman parte de la firma). */
  headers: Record<string, string>;
};

export interface Almacen {
  readonly proveedor: "supabase" | "r2";
  /** URL firmada de un solo uso para subir `bytes` bytes de tipo `contentType` a `clave`. */
  urlSubida(clave: string, contentType: string, bytes: number): Promise<SubidaFirmada>;
  /** Tamaño del objeto, o null si no existe. */
  info(clave: string): Promise<{ bytes: number } | null>;
  /** Primeros `n` bytes del objeto (para verificar su firma real), o null si no existe. */
  leerInicio(clave: string, n: number): Promise<Uint8Array | null>;
  eliminar(claves: string[]): Promise<void>;
  /**
   * Claves de todos los objetos bajo `prefijo` (p. ej. "{polizaId}/"). Se lista antes de borrar
   * la póliza: en Supabase, las políticas del bucket solo dejan ver archivos de pólizas de la
   * agencia que todavía existen.
   */
  listarCarpeta(prefijo: string): Promise<string[]>;
  /**
   * URL firmada de lectura de corta vigencia; con `descargarComo`, fuerza la descarga con ese
   * nombre. `vigenciaS` la alarga (p. ej. un enlace en un correo; máximo 7 días).
   */
  urlDescarga(clave: string, opciones?: { descargarComo?: string; vigenciaS?: number }): Promise<string>;
}

/** Vigencia de las URLs firmadas de Supabase (las de R2 se definen en lib/storage.ts). */
export const VIGENCIA_DESCARGA_S = 60;
