import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, RefreshCcw } from "lucide-react";

import { CapturaWorkspace } from "@/components/captura/captura-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { getPolizaParaRenovar } from "@/lib/polizas/formulario";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Captura Inteligente",
};

export default async function CapturaPage({ searchParams }: PageProps<"/captura">) {
  const { renovar } = await searchParams;
  const [user, aseguradoras] = await Promise.all([requireUsuarioCrm(), getAseguradorasOpciones()]);
  const verComisiones = veComisiones(user);
  // Un ejecutivo que solo ve su cartera no elige: sus pólizas quedan a su nombre.
  const ejecutivos = user.soloSuCartera ? undefined : await getEjecutivos(user.agenciaId);
  const ejecutivoPredeterminado = ejecutivos?.some((e) => e.id === user.id) ? user.id : "";
  // ?renovar=<id>: captura de la renovación de esa póliza, con sus datos precargados.
  const renovacion =
    typeof renovar === "string" ? await getPolizaParaRenovar(renovar, { incluirComision: verComisiones }) : null;
  if (typeof renovar === "string" && !renovacion) notFound();

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {renovacion ? `Renovar póliza ${renovacion.numero}` : "Captura Inteligente"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {renovacion ? (
            <>
              <RefreshCcw className="mr-1 inline size-3.5 text-primary" />
              Se conserva el número de póliza {renovacion.numero}; captura la póliza vigor de la nueva vigencia (la
              que se usa para la cobranza).{" "}
              <Link href={`/polizas/${renovacion.id}`} className="text-primary hover:underline">
                Ver póliza anterior
              </Link>
            </>
          ) : (
            "Extrae los datos de una póliza con IA o captúrala manualmente por ramo."
          )}
        </p>
      </div>
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
