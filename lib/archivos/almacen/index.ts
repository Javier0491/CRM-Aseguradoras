import "server-only";

import { crearAlmacenR2 } from "@/lib/archivos/almacen/r2";
import { crearAlmacenSupabase } from "@/lib/archivos/almacen/supabase";
import type { Almacen } from "@/lib/archivos/almacen/tipos";

export type { Almacen } from "@/lib/archivos/almacen/tipos";

/**
 * Proveedor de almacenamiento según ALMACEN_ARCHIVOS ("r2" o "supabase"; Supabase por omisión).
 * Cambiar de proveedor no toca la base de datos: solo guarda claves de objeto.
 */
export function getAlmacen(): Almacen {
  const proveedor = process.env.ALMACEN_ARCHIVOS?.trim().toLowerCase() || "supabase";
  if (proveedor === "r2") return crearAlmacenR2();
  if (proveedor === "supabase") return crearAlmacenSupabase();
  throw new Error(`ALMACEN_ARCHIVOS no válido: "${proveedor}" (usa "r2" o "supabase").`);
}
