import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";

import { ConciliacionWorkspace } from "@/components/conciliacion/conciliacion-workspace";
import { HistorialLotes } from "@/components/conciliacion/historial-lotes";
import { Button } from "@/components/ui/button";
import { requireConciliador, veComisiones } from "@/lib/auth/dal";
import { contarAclaraciones } from "@/lib/conciliacion/aclaraciones";
import { getLotes } from "@/lib/conciliacion/lotes";
import { db } from "@/lib/db";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";

export const metadata: Metadata = {
  title: "Conciliación de Cobranza",
};

export default async function ConciliacionPage() {
  // Administrador y Ejecutivo comercial.
  const usuario = await requireConciliador();
  const { agenciaId } = usuario;
  // Sin permiso de comisiones (todos menos el SUPERADMIN) la conciliación solo marca qué recibos se cobraron.
  const verComisiones = veComisiones(usuario);
  const [aseguradoras, conEsquema, lotes, aclaraciones] = await Promise.all([
    getAseguradorasOpciones(),
    db.esquemaComision.findMany({ where: { agenciaId }, distinct: ["aseguradora_id"], select: { aseguradora_id: true } }),
    getLotes(usuario),
    verComisiones ? contarAclaraciones() : 0,
  ]);

  return (
    // Ancho máximo: en monitores anchos el contenido no se estira de lado a lado.
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Conciliación de Cobranza</h1>
          <p className="text-sm text-muted-foreground">
            {verComisiones
              ? "Cruza el estado de cuenta de comisiones de cada aseguradora contra los recibos del CRM."
              : "Cruza el estado de cuenta de cada aseguradora contra los recibos del CRM para marcar los cobrados."}
            {usuario.soloSuCartera && " Solo se cruzan las pólizas de tu cartera."}
          </p>
        </div>
        {verComisiones && (
          <Button asChild variant="outline" className={aclaraciones > 0 ? "border-warning/40 text-warning" : undefined}>
            <Link href="/conciliacion/aclaraciones">
              <MessageSquareWarning /> Aclaraciones{aclaraciones > 0 && ` (${aclaraciones})`}
            </Link>
          </Button>
        )}
      </div>
      <ConciliacionWorkspace
        aseguradoras={aseguradoras}
        conEsquema={conEsquema.map((e) => e.aseguradora_id)}
        verComisiones={verComisiones}
      />
      <HistorialLotes lotes={lotes} />
    </div>
  );
}
