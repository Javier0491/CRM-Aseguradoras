"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import type { ActividadesPendientes } from "@/lib/tareas/queries";
import { EVENTO_ACTIVIDADES, MINUTOS_RECORDATORIO_ACTIVIDADES } from "@/lib/tareas/actividades";

type Respuesta = ActividadesPendientes & { verPolizas: boolean };
type Actividad = Respuesta["actividades"][number];

const INTERVALO_MS = MINUTOS_RECORDATORIO_ACTIVIDADES * 60_000;
// Último aviso, compartido entre pestañas: con varias abiertas no se repite el recordatorio.
const CLAVE_ULTIMO_AVISO = "actividades:ultimo-aviso";

function ultimoAviso() {
  try {
    return Number(localStorage.getItem(CLAVE_ULTIMO_AVISO)) || 0;
  } catch {
    return 0;
  }
}

function marcarAviso() {
  try {
    localStorage.setItem(CLAVE_ULTIMO_AVISO, String(Date.now()));
  } catch {
    // Sin almacenamiento (navegación privada): cada pestaña avisa por su cuenta.
  }
}

async function consultar(signal?: AbortSignal): Promise<Respuesta | null> {
  try {
    const res = await fetch("/api/actividades", { cache: "no-store", signal });
    return res.ok ? ((await res.json()) as Respuesta) : null;
  } catch {
    // Sin conexión o navegación cancelada: se conserva lo anterior.
    return null;
  }
}

const destino = (a: Actividad | undefined, verPolizas: boolean) =>
  a?.poliza && verPolizas ? `/polizas/${a.poliza.id}` : "/tareas";

const describir = (a: Actividad) =>
  [a.titulo, a.poliza && `póliza ${a.poliza.numero} (${a.poliza.cliente})`].filter(Boolean).join(" · ");

/**
 * Actividades de póliza sin finalizar (cambio de agente, …): una franja fija bajo el encabezado y,
 * cada pocos minutos mientras el CRM está abierto, un aviso en pantalla y, si la pestaña no está
 * a la vista y se dieron permisos, una notificación del sistema. Insiste hasta que se finalizan.
 */
export function RecordatorioActividades() {
  const pathname = usePathname();
  const router = useRouter();
  const [datos, setDatos] = React.useState<Respuesta | null>(null);

  const avisar = React.useCallback(
    (r: Respuesta) => {
      if (r.total === 0 || Date.now() - ultimoAviso() < INTERVALO_MS - 5_000) return;
      marcarAviso();
      const primera = r.actividades[0];
      const titulo = r.total === 1 ? "Tienes 1 actividad de póliza sin finalizar" : `Tienes ${r.total} actividades de póliza sin finalizar`;
      const cuerpo = primera ? describir(primera) : "";
      const url = destino(primera, r.verPolizas);
      toast.warning(titulo, {
        id: "recordatorio-actividades",
        description: cuerpo,
        duration: 60_000,
        action: { label: "Ver", onClick: () => router.push(url) },
      });
      if (document.visibilityState === "visible" || !("Notification" in window) || Notification.permission !== "granted") return;
      void navigator.serviceWorker
        ?.getRegistration()
        .then((registro) =>
          registro?.showNotification(titulo, {
            body: cuerpo,
            icon: "/marca/icono-192.png",
            badge: "/marca/zensecure.png",
            tag: "actividades-pendientes",
            // @ts-expect-error renotify existe en los navegadores, aunque falta en los tipos del DOM.
            renotify: true,
            requireInteraction: true,
            data: { url },
          })
        )
        .catch(() => {
          // Sin service worker: queda el aviso en pantalla.
        });
    },
    [router]
  );

  // Al entrar y al cambiar de pantalla (p. ej. después de finalizar una) se actualiza la franja.
  React.useEffect(() => {
    const control = new AbortController();
    void consultar(control.signal).then((r) => {
      if (!r) return;
      setDatos(r);
      avisar(r);
    });
    return () => control.abort();
  }, [pathname, avisar]);

  React.useEffect(() => {
    const t = window.setInterval(
      () =>
        void consultar().then((r) => {
          if (!r) return;
          setDatos(r);
          avisar(r);
        }),
      INTERVALO_MS
    );
    const alCambiar = () => void consultar().then((r) => r && setDatos(r));
    window.addEventListener(EVENTO_ACTIVIDADES, alCambiar);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(EVENTO_ACTIVIDADES, alCambiar);
    };
  }, [avisar]);

  if (!datos || datos.total === 0) return null;
  const primera = datos.actividades[0];
  return (
    <div
      role="status"
      className="sticky top-14 z-10 flex items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive backdrop-blur"
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
      </span>
      <BellRing className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">
          {datos.total === 1 ? "1 actividad de póliza sin finalizar" : `${datos.total} actividades de póliza sin finalizar`}
        </span>
        {primera && <span className="text-destructive/80"> · {describir(primera)}</span>}
      </p>
      <Link href={destino(primera, datos.verPolizas)} className="shrink-0 font-medium underline-offset-4 hover:underline">
        {datos.total === 1 ? "Ver" : "Ver la primera"}
      </Link>
      {datos.total > 1 && (
        <Link href="/tareas" className="hidden shrink-0 font-medium underline-offset-4 hover:underline sm:inline">
          Todas
        </Link>
      )}
    </div>
  );
}
