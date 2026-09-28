import type { Metadata } from "next";

import { CapturaWorkspace } from "@/components/captura/captura-workspace";
import { esAdmin, requireUser } from "@/lib/auth/dal";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";

export const metadata: Metadata = {
  title: "Captura Inteligente",
};

export default async function CapturaPage() {
  const [user, aseguradoras] = await Promise.all([requireUser(), getAseguradorasOpciones()]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Captura Inteligente</h1>
        <p className="text-sm text-muted-foreground">
          Extrae los datos de una póliza con IA o captúrala manualmente por ramo.
        </p>
      </div>
      <CapturaWorkspace aseguradoras={aseguradoras} verComisiones={esAdmin(user)} />
    </>
  );
}
