// Avisos flotantes (Sonner) del lado del cliente. El <Toaster /> vive en el layout raíz.
import { toast } from "sonner";

type Resultado = { ok: boolean; error?: string };

/**
 * Ejecuta la acción que deshace otra (desde el botón "Deshacer" de un aviso) y cuenta cómo
 * terminó en el mismo aviso: "Deshaciendo…" → listo o el error.
 */
export async function deshacer(accion: () => Promise<Resultado>, listo: string) {
  const id = toast.loading("Deshaciendo…");
  try {
    const r = await accion();
    if (r.ok) toast.success(listo, { id });
    else toast.error(r.error ?? "No se pudo deshacer.", { id });
  } catch {
    toast.error("No se pudo deshacer: revisa tu conexión e inténtalo de nuevo.", { id });
  }
}

/**
 * Opciones de un aviso con botón "Deshacer": `toast("Tarea borrada", { ...conDeshacer(…) })`.
 * Dura un poco más que uno normal para alcanzar a usarlo.
 */
export const conDeshacer = (accion: () => Promise<Resultado>, listo: string) => ({
  duration: 6000,
  action: { label: "Deshacer", onClick: () => void deshacer(accion, listo) },
});
