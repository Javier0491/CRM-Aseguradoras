"use client";

import * as React from "react";
import { Bot, Loader2, PlugZap, Power } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cambiarCanalCotizador } from "@/lib/cotizador/actions";
import { ETIQUETA_RAMO, type AseguradoraDelRamo, type EleccionCanal, type RamoCotizador } from "@/lib/cotizador/aseguradoras";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: EleccionCanal; etiqueta: string; icono: typeof Bot }[] = [
  { valor: "ROBOT", etiqueta: "Robot", icono: Bot },
  { valor: "API", etiqueta: "API", icono: PlugZap },
  { valor: "APAGADO", etiqueta: "Apagada", icono: Power },
];

function motivoNoDisponible(valor: EleccionCanal): string {
  return valor === "API" ? "Falta conectar la API de esta aseguradora" : "El robot todavía no sabe cotizar en este portal";
}

/**
 * Multicotizador → Conexiones: por cada aseguradora del ramo, si cotiza con el robot de la oficina,
 * con su API o si queda apagada. Solo el administrador cambia; los demás lo ven.
 */
export function ConexionesAseguradoras({
  ramo,
  aseguradoras,
  esAdmin,
}: {
  ramo: RamoCotizador;
  aseguradoras: AseguradoraDelRamo[];
  esAdmin: boolean;
}) {
  const [ocupada, setOcupada] = React.useState<string | null>(null);
  const activas = aseguradoras.filter((a) => a.canal !== null).length;

  async function elegir(clave: string, eleccion: EleccionCanal) {
    setOcupada(clave);
    try {
      const r = await cambiarCanalCotizador(clave, ramo, eleccion);
      if (!r.ok) toast.error(r.error);
    } catch {
      toast.error("Sin conexión. Intenta de nuevo.");
    } finally {
      setOcupada(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZap className="size-4 text-primary" /> Conexiones de {ETIQUETA_RAMO[ramo]}
        </CardTitle>
        <CardDescription>
          {activas} de {aseguradoras.length} aseguradoras se pueden cotizar. Robot: la computadora de la oficina entra al
          portal. API: la aseguradora contesta directo (ninguna conectada todavía).
          {!esAdmin && " Solo un administrador puede cambiarlas."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {aseguradoras.map((a) => {
            const actual: EleccionCanal | null = a.apagada ? "APAGADO" : a.canal;
            const sinCanal = a.disponibles.length === 0;
            return (
              <li key={a.clave} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {sinCanal ? "Próximamente: falta robot o API" : a.canal === null ? "Apagada" : a.canal === "API" ? "Por API" : "Por robot"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1" role="radiogroup" aria-label={`Conexión de ${a.nombre}`}>
                  {ocupada === a.clave && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  {OPCIONES.map((o) => {
                    const disponible = o.valor === "APAGADO" ? !sinCanal : a.disponibles.includes(o.valor);
                    const elegida = actual === o.valor;
                    return (
                      <button
                        key={o.valor}
                        type="button"
                        role="radio"
                        aria-checked={elegida}
                        disabled={!esAdmin || !disponible || ocupada !== null}
                        title={disponible ? o.etiqueta : o.valor === "APAGADO" ? "No hay nada que apagar todavía" : motivoNoDisponible(o.valor)}
                        onClick={() => !elegida && elegir(a.clave, o.valor)}
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
                          elegida ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground",
                          disponible && esAdmin && !elegida && "hover:bg-muted",
                          !disponible && "opacity-40"
                        )}
                      >
                        <o.icono className="size-3" />
                        {o.etiqueta}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
