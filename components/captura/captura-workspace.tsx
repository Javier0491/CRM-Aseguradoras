"use client";

import * as React from "react";

import { OcrDropzone } from "@/components/captura/ocr-dropzone";
import { PolizaForm, type PolizaFormInicial } from "@/components/captura/poliza-form";
import type { ExtraccionPoliza } from "@/lib/ocr/types";

function aValoresIniciales(datos: ExtraccionPoliza): PolizaFormInicial {
  return {
    ramo: datos.ramo.valor,
    generales: {
      cliente: datos.cliente.valor,
      aseguradora: datos.aseguradora.valor,
      numeroPoliza: datos.numeroPoliza.valor,
      vigenciaInicio: datos.vigencia.valor.inicio,
      vigenciaFin: datos.vigencia.valor.fin,
      primaTotal: datos.monto.valor.toFixed(2),
    },
  };
}

export function CapturaWorkspace() {
  // `version` remonta el formulario para que tome los valores extraídos como estado inicial.
  const [prellenado, setPrellenado] = React.useState<{
    version: number;
    inicial?: PolizaFormInicial;
  }>({ version: 0 });

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="xl:sticky xl:top-20">
        <OcrDropzone
          onAplicar={(datos) =>
            setPrellenado((p) => ({ version: p.version + 1, inicial: aValoresIniciales(datos) }))
          }
        />
      </div>
      <PolizaForm key={prellenado.version} inicial={prellenado.inicial} />
    </div>
  );
}
