"use client";

import * as React from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { guardarSuscripcionPush, quitarSuscripcionPush, type SuscripcionNavegador } from "@/lib/notificaciones/actions";
import { cn } from "@/lib/utils";

const LLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

type Estado = "no-disponible" | "pendiente" | "activas" | "bloqueadas" | "cargando";

const soportado = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(LLAVE_PUBLICA);

/** La llave pública VAPID (base64url) como bytes, que pide el navegador. */
function llaveBytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

const aSuscripcion = (s: PushSubscription) => s.toJSON() as unknown as SuscripcionNavegador;

/**
 * Registra el service worker y mantiene al día la suscripción de este navegador (si ya se dieron
 * permisos). Va en el encabezado de todas las páginas; no pinta nada.
 */
export function RegistroNotificaciones() {
  React.useEffect(() => {
    if (!soportado()) return;
    void (async () => {
      try {
        const registro = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission !== "granted") return;
        const s = await registro.pushManager.getSubscription();
        // Se vuelve a guardar en cada visita: si cambió de cuenta o se renovó, queda al día.
        if (s) await guardarSuscripcionPush(aSuscripcion(s));
      } catch {
        // Sin service worker (navegador privado, políticas): el CRM funciona igual.
      }
    })();
  }, []);
  return null;
}

/**
 * Botón para activar (o desactivar) las notificaciones de este navegador: mensajes del chat,
 * tareas asignadas y el recordatorio de la mañana, aunque el CRM esté cerrado.
 */
export function ActivarNotificaciones({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  const [estado, setEstado] = React.useState<Estado>("cargando");

  React.useEffect(() => {
    let vigente = true;
    void (async () => {
      let siguiente: Estado = "pendiente";
      if (!soportado()) siguiente = "no-disponible";
      else if (Notification.permission === "denied") siguiente = "bloqueadas";
      else {
        try {
          const registro = await navigator.serviceWorker.getRegistration();
          const s = await registro?.pushManager.getSubscription();
          if (s && Notification.permission === "granted") siguiente = "activas";
        } catch {
          // Se queda en "pendiente": el botón deja intentarlo.
        }
      }
      if (vigente) setEstado(siguiente);
    })();
    return () => {
      vigente = false;
    };
  }, []);

  async function activar() {
    setEstado("cargando");
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueadas" : "pendiente");
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const s =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveBytes(LLAVE_PUBLICA) }));
      const r = await guardarSuscripcionPush(aSuscripcion(s));
      if (!r.ok) throw new Error("no se guardó");
      setEstado("activas");
      toast.success("Notificaciones activadas", { description: "Te llegarán los mensajes y las tareas aunque el CRM esté cerrado." });
    } catch {
      setEstado("pendiente");
      toast.error("No se pudieron activar las notificaciones en este navegador.");
    }
  }

  async function desactivar() {
    setEstado("cargando");
    try {
      const registro = await navigator.serviceWorker.ready;
      const s = await registro.pushManager.getSubscription();
      if (s) {
        await quitarSuscripcionPush(s.endpoint);
        await s.unsubscribe();
      }
      setEstado("pendiente");
      toast("Notificaciones desactivadas en este navegador");
    } catch {
      setEstado("activas");
    }
  }

  if (estado === "no-disponible") return null;
  if (compacto) {
    if (estado === "activas" || estado === "cargando") return null;
    return (
      <div className={cn("flex items-start gap-3 border-b bg-primary/[0.06] px-4 py-3", className)}>
        <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-xs">
          {estado === "bloqueadas" ? (
            <p className="text-muted-foreground">
              Las notificaciones están bloqueadas en este navegador. Actívalas desde el candado junto a la dirección.
            </p>
          ) : (
            <>
              <p className="font-medium">Recibe los mensajes aunque el CRM esté cerrado</p>
              <Button size="sm" className="mt-2 h-7" onClick={activar}>
                Activar notificaciones
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <Button
      variant="outline"
      className={className}
      onClick={estado === "activas" ? desactivar : activar}
      disabled={estado === "cargando" || estado === "bloqueadas"}
      title={estado === "bloqueadas" ? "Bloqueadas en este navegador: actívalas desde el candado junto a la dirección." : undefined}
    >
      {estado === "cargando" ? <Loader2 className="animate-spin" /> : estado === "activas" ? <BellOff /> : <BellRing />}
      {estado === "activas" ? "Desactivar notificaciones" : estado === "bloqueadas" ? "Notificaciones bloqueadas" : "Activar notificaciones"}
    </Button>
  );
}
