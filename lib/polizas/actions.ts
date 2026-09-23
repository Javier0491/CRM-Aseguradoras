"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/dal";
import { registrarPoliza, type GuardarPolizaResultado } from "@/lib/polizas/guardar";

export async function guardarPoliza(raw: unknown): Promise<GuardarPolizaResultado> {
  // Las Server Actions son endpoints públicos: se valida la sesión aquí mismo.
  if (!(await getCurrentUser())) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const resultado = await registrarPoliza(raw);
  if (resultado.ok) revalidatePath("/polizas");
  return resultado;
}
