import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, FilePenLine } from "lucide-react";

import { CapturaWorkspace } from "@/components/captura/captura-workspace";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUsuarioCrm, veComisiones } from "@/lib/auth/dal";
import { getPolizaParaEditar } from "@/lib/polizas/formulario";
import { CAMPOS_CALENDARIO } from "@/lib/polizas/guardar";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Endoso de póliza",
};

/**
 * Endoso con Captura Inteligente: se sube la póliza endosada, la IA actualiza sus datos (sin tocar
 * el número ni la vigencia), se registra el endoso y se le avisa al cliente con la póliza nueva.
 */
export default async function EndosoPolizaPage({ params }: PageProps<"/polizas/[id]/endoso">) {
  const { id } = await params;
  const user = await requireUsuarioCrm();
  const verComisiones = veComisiones(user);
  const [poliza, aseguradoras, ejecutivos] = await Promise.all([
    getPolizaParaEditar(id, { incluirComision: verComisiones }),
    getAseguradorasOpciones(),
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
  ]);
  if (!poliza) notFound();
  const inicio = poliza.inicial.generales?.vigenciaInicio ?? "";
  const fin = poliza.inicial.generales?.vigenciaFin ?? "";

  return (
    <>
      <EncabezadoModulo
        icono={FilePenLine}
        titulo={`Endoso de la póliza ${poliza.numero}`}
        descripcion={
          <>
            Sube la póliza endosada: la IA actualiza los datos y se registra el endoso. El número y la vigencia no
            cambian.{" "}
            <Link href={`/polizas/${poliza.id}`} className="text-primary hover:underline">
              Volver a la póliza
            </Link>
          </>
        }
      />
      {poliza.cancelada ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Ban className="size-7 text-destructive" />
            <p className="font-medium">La póliza {poliza.numero} está cancelada</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A una póliza cancelada no se le registran endosos. Si fue un error, reactívala desde su detalle.
            </p>
            <Button asChild variant="outline">
              <Link href={`/polizas/${poliza.id}`}>Ver póliza</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <CapturaWorkspace
          aseguradoras={aseguradoras}
          verComisiones={verComisiones}
          ejecutivos={ejecutivos}
          endoso={{
            polizaId: poliza.id,
            numero: poliza.numero,
            vigencia: { inicio, fin },
            // Con recibos cobrados, el calendario (forma de pago, prima total y plazo) queda fijo.
            bloqueados: poliza.conCobros ? [...CAMPOS_CALENDARIO, "plazoPago"] : [],
            inicial: poliza.inicial,
          }}
        />
      )}
    </>
  );
}
