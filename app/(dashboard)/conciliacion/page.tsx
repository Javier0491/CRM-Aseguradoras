import type { Metadata } from "next";

import { ConciliacionWorkspace } from "@/components/conciliacion/conciliacion-workspace";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";

export const metadata: Metadata = {
  title: "Conciliación de Cobranza",
};

export default async function ConciliacionPage() {
  await requireAdmin();
  const [aseguradoras, conEsquema] = await Promise.all([
    getAseguradorasOpciones(),
    db.esquemaComision.findMany({ distinct: ["aseguradora_id"], select: { aseguradora_id: true } }),
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Conciliación de Cobranza</h1>
        <p className="text-sm text-muted-foreground">
          Cruza el estado de cuenta de comisiones de cada aseguradora contra los recibos del CRM.
        </p>
      </div>
      <ConciliacionWorkspace aseguradoras={aseguradoras} conEsquema={conEsquema.map((e) => e.aseguradora_id)} />
    </>
  );
}
