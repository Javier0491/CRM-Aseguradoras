import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, FolderUp, RefreshCcw, ScanText } from "lucide-react";

import { CapturaWorkspace } from "@/components/captura/captura-workspace";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { esAdmin, requireUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { getUsoPlan } from "@/lib/planes/limites";
import { hayCupo } from "@/lib/planes/planes";
import { getPolizaParaRenovar } from "@/lib/polizas/formulario";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Captura Inteligente",
};

export default async function CapturaPage({ searchParams }: PageProps<"/captura">) {
  const { renovar } = await searchParams;
  const [user, aseguradoras] = await Promise.all([requireUsuarioCrm(), getAseguradorasOpciones()]);
  const verComisiones = veComisiones(user);
  const { ocr, nombre: plan } = await getUsoPlan(user.agenciaId);
  // Un ejecutivo que solo ve su cartera no elige: sus pólizas quedan a su nombre.
  const ejecutivos = user.soloSuCartera ? undefined : await getEjecutivos(user.agenciaId);
  const ejecutivoPredeterminado = ejecutivos?.some((e) => e.id === user.id) ? user.id : "";
  // ?renovar=<id>: captura de la renovación de esa póliza, con sus datos precargados.
  const renovacion =
    typeof renovar === "string" ? await getPolizaParaRenovar(renovar, { incluirComision: verComisiones }) : null;
  if (typeof renovar === "string" && !renovacion) notFound();

  return (
    <>
      <EncabezadoModulo
        icono={renovacion ? RefreshCcw : ScanText}
        titulo={renovacion ? `Renovar póliza ${renovacion.numero}` : "Captura Inteligente"}
        descripcion={
          renovacion ? (
            <>
              Se conserva el número de póliza {renovacion.numero}; captura la póliza vigor de la nueva vigencia (la
              que se usa para la cobranza).{" "}
              <Link href={`/polizas/${renovacion.id}`} className="text-primary hover:underline">
                Ver póliza anterior
              </Link>
            </>
          ) : (
            "Extrae los datos de una póliza con IA o captúrala manualmente por ramo."
          )
        }
        acciones={
          !renovacion && esAdmin(user) ? (
            <Button asChild variant="outline">
              <Link href="/captura/masiva">
                <FolderUp /> Carga masiva
              </Link>
            </Button>
          ) : undefined
        }
      >
        {ocr.limite === 0 ? (
          <p className="mt-1 text-xs font-medium text-warning">
            Tu plan {plan} no incluye captura con IA: captura las pólizas a mano o cámbiate a la edición Pro.
          </p>
        ) : (
          ocr.limite !== null && (
            // Cuánto queda del mes: una barra que se llena y se pone ámbar al agotarse.
            <div className="mt-2 flex max-w-xs items-center gap-2.5">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Escaneos con IA usados este mes"
                aria-valuemin={0}
                aria-valuemax={ocr.limite}
                aria-valuenow={ocr.usados}
              >
                <div
                  className={cn(
                    "animate-barra h-full rounded-full",
                    hayCupo(ocr.usados, ocr.limite) ? "bg-primary shadow-[0_0_8px_var(--color-primary)]" : "bg-warning"
                  )}
                  style={{ width: `${Math.min(100, (ocr.usados / Math.max(ocr.limite, 1)) * 100)}%`, animationDelay: "400ms" }}
                />
              </div>
              <p
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  hayCupo(ocr.usados, ocr.limite) ? "text-muted-foreground" : "font-medium text-warning"
                )}
              >
                {ocr.usados} de {ocr.limite} escaneos con IA (plan {plan})
              </p>
            </div>
          )
        )}
      </EncabezadoModulo>
      {renovacion?.cancelada ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Ban className="size-7 text-destructive" />
            <p className="font-medium">La póliza {renovacion.numero} está cancelada</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Una póliza cancelada no se renueva. Si fue un error, reactívala desde su detalle; si el cliente
              contrató de nuevo, captúrala como póliza nueva.
            </p>
            <Button asChild variant="outline">
              <Link href={`/polizas/${renovacion.id}`}>Ver póliza</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <CapturaWorkspace
          // Una renovación distinta remonta el área de captura con sus propios datos.
          key={renovacion?.id ?? "nueva"}
          aseguradoras={aseguradoras}
          verComisiones={verComisiones}
          ejecutivos={ejecutivos}
          ejecutivoPredeterminado={ejecutivoPredeterminado}
          renovacion={
            renovacion ? { anterior: { id: renovacion.id, numero: renovacion.numero }, inicial: renovacion.inicial } : undefined
          }
        />
      )}
    </>
  );
}
