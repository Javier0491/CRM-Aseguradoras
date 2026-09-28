import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshCcw } from "lucide-react";

import { CapturaWorkspace } from "@/components/captura/captura-workspace";
import { esAdmin, requireUser } from "@/lib/auth/dal";
import { getPolizaParaRenovar } from "@/lib/polizas/formulario";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";

export const metadata: Metadata = {
  title: "Captura Inteligente",
};

export default async function CapturaPage({ searchParams }: PageProps<"/captura">) {
  const { renovar } = await searchParams;
  const [user, aseguradoras] = await Promise.all([requireUser(), getAseguradorasOpciones()]);
  const verComisiones = esAdmin(user);
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
              Se conserva la póliza vigor {renovacion.polizaVigor ?? ""} para que la cadena y el año de la póliza
              sigan correctos.{" "}
              <Link href={`/polizas/${renovacion.id}`} className="text-primary hover:underline">
                Ver póliza anterior
              </Link>
            </>
          ) : (
            "Extrae los datos de una póliza con IA o captúrala manualmente por ramo."
          )}
        </p>
      </div>
      <CapturaWorkspace
        // Una renovación distinta remonta el área de captura con sus propios datos.
        key={renovacion?.id ?? "nueva"}
        aseguradoras={aseguradoras}
        verComisiones={verComisiones}
        renovacion={renovacion ? { anterior: { id: renovacion.id, numero: renovacion.numero }, inicial: renovacion.inicial } : undefined}
      />
    </>
  );
}
