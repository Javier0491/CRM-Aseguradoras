import type { Metadata } from "next";

import { AgenciaForm } from "@/components/configuracion/agencia-form";
import { AjustesOperacion } from "@/components/configuracion/ajustes-operacion";
import { getAgencia } from "@/lib/agencias/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Mi agencia",
};

export default async function MiAgenciaPage() {
  const { agenciaId } = await requireAdmin();
  const [agencia, extra] = await Promise.all([
    getAgencia(agenciaId),
    db.agencia.findUniqueOrThrow({
      where: { id: agenciaId },
      select: { logoDocumentosUrl: true, slug: true, carteraPorEjecutivo: true },
    }),
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mi agencia</h1>
        <p className="text-sm text-muted-foreground">
          Nombre, ícono, logo y color de tu agencia en la plataforma y en sus correos; liga de acceso y cartera.
        </p>
      </div>
      <AgenciaForm agencia={{ ...agencia, logoDocumentosUrl: extra.logoDocumentosUrl }} />
      <AjustesOperacion slug={extra.slug} carteraPorEjecutivo={extra.carteraPorEjecutivo} />
    </>
  );
}
