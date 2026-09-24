"use client";

import * as React from "react";

import { OcrDropzone } from "@/components/captura/ocr-dropzone";
import { PolizaForm, type PolizaFormInicial } from "@/components/captura/poliza-form";
import type { ExtraccionPoliza } from "@/lib/ocr/types";
import type { Opcion } from "@/lib/polizas/ramos";

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

function aValoresIniciales(datos: ExtraccionPoliza, aseguradoras: Opcion[]): PolizaFormInicial {
  // La IA devuelve el nombre de la aseguradora; el formulario necesita su id en BD.
  const nombre = datos.generales.aseguradora;
  const aseguradora = nombre
    ? aseguradoras.find((a) => normalizar(a.label) === normalizar(nombre))
    : undefined;
  return {
    ramo: datos.ramo ?? undefined,
    generales: { ...datos.generales, aseguradora: aseguradora?.value ?? "" },
    especificos: datos.especificos,
  };
}

export function CapturaWorkspace({ aseguradoras }: { aseguradoras: Opcion[] }) {
  // `version` remonta el formulario para que tome los valores extraídos como estado inicial.
  const [prellenado, setPrellenado] = React.useState<{
    version: number;
    inicial?: PolizaFormInicial;
  }>({ version: 0 });
  const [extrayendo, setExtrayendo] = React.useState(false);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="xl:sticky xl:top-20">
        <OcrDropzone
          onProcesando={setExtrayendo}
          onAplicar={(datos) =>
            setPrellenado((p) => ({
              version: p.version + 1,
              inicial: aValoresIniciales(datos, aseguradoras),
            }))
          }
        />
      </div>
      <PolizaForm
        key={prellenado.version}
        inicial={prellenado.inicial}
        aseguradoras={aseguradoras}
        extrayendo={extrayendo}
      />
    </div>
  );
}
