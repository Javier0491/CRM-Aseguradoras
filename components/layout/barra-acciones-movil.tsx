import { FileText, Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** 10 dígitos de México (con o sin lada 52) → número internacional para WhatsApp; null si no sirve. */
export function numeroWhatsApp(telefono: string) {
  const d = telefono.replace(/\D/g, "");
  const local = d.length === 12 && d.startsWith("52") ? d.slice(2) : d.length === 13 && d.startsWith("521") ? d.slice(3) : d;
  return local.length === 10 ? `52${local}` : null;
}

type Accion = { href: string; label: string; icono: LucideIcon; externa?: boolean; tono?: string };

/**
 * Barra fija inferior solo en celular: contacto con el cliente a un toque (llamar, WhatsApp,
 * correo) y, si existe, la carátula. Deja un espacio al final de la página para no tapar contenido.
 */
export function BarraAccionesMovil({
  telefono,
  email,
  mensaje,
  asunto,
  caratulaHref,
}: {
  telefono: string;
  email: string;
  /** Texto inicial del WhatsApp y del correo. */
  mensaje?: string;
  asunto?: string;
  caratulaHref?: string | null;
}) {
  const wa = telefono ? numeroWhatsApp(telefono) : null;
  const acciones: Accion[] = [
    ...(telefono ? [{ href: `tel:${telefono.replace(/[^\d+]/g, "")}`, label: "Llamar", icono: Phone }] : []),
    ...(wa
      ? [
          {
            href: `https://wa.me/${wa}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`,
            label: "WhatsApp",
            icono: MessageCircle,
            externa: true,
            tono: "text-success",
          },
        ]
      : []),
    ...(email.trim()
      ? [
          {
            href: `mailto:${email.trim()}${
              asunto || mensaje
                ? `?${[asunto && `subject=${encodeURIComponent(asunto)}`, mensaje && `body=${encodeURIComponent(mensaje)}`]
                    .filter(Boolean)
                    .join("&")}`
                : ""
            }`,
            label: "Correo",
            icono: Mail,
          },
        ]
      : []),
    ...(caratulaHref ? [{ href: caratulaHref, label: "Carátula", icono: FileText, externa: true }] : []),
  ];
  if (acciones.length === 0) return null;

  return (
    <>
      {/* Espacio para que la barra no tape el final de la página. */}
      <div aria-hidden className="h-16 md:hidden" />
      <nav
        aria-label="Acciones rápidas"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        <ul className="grid gap-1" style={{ gridTemplateColumns: `repeat(${acciones.length}, minmax(0, 1fr))` }}>
          {acciones.map((a) => (
            <li key={a.label}>
              <a
                href={a.href}
                {...(a.externa && { target: "_blank", rel: "noopener noreferrer" })}
                className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground active:bg-accent"
              >
                <a.icono className={cn("size-5", a.tono ?? "text-primary")} />
                {a.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
