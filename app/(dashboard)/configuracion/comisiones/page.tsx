import type { Metadata } from "next";

import { MatrizComisiones } from "@/components/comisiones/matriz-comisiones";
import { ramoLabel } from "@/components/polizas/poliza-ui";
import { db } from "@/lib/db";
import type { Ramo } from "@/lib/generated/prisma/client";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";

export const metadata: Metadata = {
  title: "Matriz de comisiones",
};

export default async function MatrizComisionesPage() {
  const [aseguradoras, esquemas] = await Promise.all([
    getAseguradorasOpciones(),
    db.esquemaComision.findMany({
      orderBy: [
        { aseguradora: { nombre: "asc" } },
        { ramo: "asc" },
        { anio_poliza: "asc" },
        { edad_minima: { sort: "asc", nulls: "first" } },
      ],
      select: {
        id: true,
        ramo: true,
        anio_poliza: true,
        porcentaje: true,
        edad_minima: true,
        edad_maxima: true,
        aseguradora: { select: { id: true, nombre: true, color_hex: true } },
      },
    }),
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Matriz de comisiones</h1>
        <p className="text-sm text-muted-foreground">
          Porcentajes por aseguradora, ramo, año de la póliza y, opcionalmente, edad del titular. Los usa la conciliación y el dashboard;
          una póliza con % personalizado ignora esta matriz.
        </p>
      </div>
      <MatrizComisiones
        esquemas={esquemas.map((e) => ({
          id: e.id,
          aseguradoraId: e.aseguradora.id,
          aseguradora: e.aseguradora.nombre,
          colorAseguradora: e.aseguradora.color_hex,
          ramo: e.ramo,
          anio: e.anio_poliza,
          porcentaje: Number(e.porcentaje),
          edadMinima: e.edad_minima,
          edadMaxima: e.edad_maxima,
        }))}
        aseguradoras={aseguradoras}
        ramos={(Object.keys(ramoLabel) as Ramo[]).map((r) => ({ value: r, label: ramoLabel[r] }))}
      />
    </>
  );
}
