import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Stethoscope, XCircle } from "lucide-react";

import { PruebaCorreo } from "@/components/superadmin/prueba-correo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperadmin } from "@/lib/auth/dal";
import { getEjecuciones } from "@/lib/plataforma/cron";
import { ejecutarDiagnostico, type EstadoRevision } from "@/lib/plataforma/diagnostico";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Diagnóstico",
};

const ICONO: Record<EstadoRevision, typeof CheckCircle2> = { ok: CheckCircle2, aviso: AlertTriangle, error: XCircle };
const COLOR: Record<EstadoRevision, string> = { ok: "text-success", aviso: "text-warning", error: "text-destructive" };

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

export default async function DiagnosticoPage() {
  await requireSuperadmin();
  // Dominio desde el que se usa el CRM: es el que R2 debe aceptar en su política CORS.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origen = `${protocolo}://${host}`;
  const [revisiones, ejecuciones] = await Promise.all([ejecutarDiagnostico(origen), getEjecuciones("diaria", 10)]);
  const problemas = revisiones.filter((r) => r.estado !== "ok").length;

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link href="/superadmin">
            <ArrowLeft /> Mis agencias
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Stethoscope className="size-6 text-primary" /> Diagnóstico
          </h1>
          <p className="text-sm text-muted-foreground">
            {problemas === 0
              ? "Todo en orden: la plataforma tiene lo necesario para operar."
              : `${problemas} ${problemas === 1 ? "punto requiere" : "puntos requieren"} atención.`}{" "}
            Revisado desde {origen}.
          </p>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {revisiones.map((r) => {
            const Icono = ICONO[r.estado];
            return (
              <li key={r.clave} className="flex items-start gap-3 px-5 py-4">
                <Icono className={cn("mt-0.5 size-5 shrink-0", COLOR[r.estado])} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-medium">{r.titulo}</p>
                  <p className="text-sm text-muted-foreground">{r.detalle}</p>
                  {r.ayuda && <p className="text-sm">{r.ayuda}</p>}
                  {r.bloque && (
                    <pre className="max-h-60 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                      {r.bloque}
                    </pre>
                  )}
                  {r.clave === "correo" && r.estado === "ok" && <PruebaCorreo />}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Últimas ejecuciones de la tarea diaria</CardTitle>
          <CardDescription>Cobranza de la plataforma y avisos automáticos a clientes (GET /api/cron/avisos).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {ejecuciones.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Aún no hay ejecuciones registradas.</p>
          ) : (
            <ul className="divide-y">
              {ejecuciones.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  {e.ok === null ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  ) : e.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="tabular-nums">
                      {fechaHora.format(e.inicio)}
                      {e.fin && (
                        <span className="text-muted-foreground"> · {Math.max(0, Math.round((e.fin.getTime() - e.inicio.getTime()) / 1000))} s</span>
                      )}
                      {e.ok === null && <span className="text-warning"> · no terminó</span>}
                    </p>
                    {e.error && <p className="break-words text-xs text-destructive">{e.error}</p>}
                    {e.resumen && (
                      <p className="break-words font-mono text-[11px] text-muted-foreground">{JSON.stringify(e.resumen)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
