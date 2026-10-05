import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PolizaForm } from "@/components/captura/poliza-form";
import { Button } from "@/components/ui/button";
import { requireUser, veComisiones } from "@/lib/auth/dal";
import { getPolizaParaEditar } from "@/lib/polizas/formulario";
import { CAMPOS_CALENDARIO } from "@/lib/polizas/guardar";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";

export const metadata: Metadata = {
  title: "Editar póliza",
};

export default async function EditarPolizaPage({ params }: PageProps<"/polizas/[id]/editar">) {
  const { id } = await params;
  const user = await requireUser();
  const verComisiones = veComisiones(user);
  const [poliza, aseguradoras] = await Promise.all([
    getPolizaParaEditar(id, { incluirComision: verComisiones }),
    getAseguradorasOpciones(),
  ]);
  if (!poliza) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href={`/polizas/${poliza.id}`}>
          <ArrowLeft /> Volver a la póliza
        </Link>
      </Button>
      <PolizaForm
        inicial={poliza.inicial}
        aseguradoras={aseguradoras}
        verComisiones={verComisiones}
        modo={{
          tipo: "edicion",
          polizaId: poliza.id,
          numero: poliza.numero,
          bloqueados: poliza.conCobros ? CAMPOS_CALENDARIO : [],
        }}
      />
    </div>
  );
}
