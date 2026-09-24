"use client";

import * as React from "react";

import { OcrDropzone } from "@/components/captura/ocr-dropzone";
import {
  PolizaForm,
  type PolizaFormHandle,
  type PolizaFormInicial,
} from "@/components/captura/poliza-form";
import type { ExtraccionPoliza } from "@/lib/ocr/types";
import type { Opcion, Ramo } from "@/lib/polizas/ramos";

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
    asegurados: datos.asegurados,
  };
}

export function CapturaWorkspace({ aseguradoras }: { aseguradoras: Opcion[] }) {
  // `version` remonta el formulario para que tome los valores extraídos como estado inicial.
  const [prellenado, setPrellenado] = React.useState<{
    version: number;
    inicial?: PolizaFormInicial;
  }>({ version: 0 });
  const [extrayendo, setExtrayendo] = React.useState(false);
  // Documento leído por la IA: si es PDF se guarda como carátula de la póliza.
  // Las imágenes se usan solo para la lectura.
  const [caratula, setCaratula] = React.useState<File | null>(null);
  // Cambiar `ronda` remonta el panel de captura para dejarlo vacío.
  const [ronda, setRonda] = React.useState(0);
  // Ramo seleccionado en el formulario: GMM Colectivo habilita el segundo documento.
  const [ramo, setRamo] = React.useState<Ramo>("autos");
  const [leyendoComplemento, setLeyendoComplemento] = React.useState(false);
  // PDF del formato de negociación: se guarda como tercer archivo de la póliza.
  const [negociacion, setNegociacion] = React.useState<File | null>(null);
  const formRef = React.useRef<PolizaFormHandle>(null);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="xl:sticky xl:top-20">
        <OcrDropzone
          key={ronda}
          onProcesando={(procesando) => {
            setExtrayendo(procesando);
            // Un documento nuevo reemplaza al anterior aunque su lectura falle.
            if (procesando) setCaratula(null);
          }}
          onLimpiar={() => setCaratula(null)}
          onAplicar={(datos, archivo) => {
            setCaratula(archivo.type === "application/pdf" ? archivo : null);
            setPrellenado((p) => ({
              version: p.version + 1,
              inicial: aValoresIniciales(datos, aseguradoras),
            }));
          }}
        />
        {ramo === "gmm_colectivo" && (
          <div className="mt-4">
            <OcrDropzone
              key={`complemento-${ronda}`}
              contexto="gmm_colectivo"
              titulo="Subir Formato de Negociación / Orden de Emisión (Opcional)"
              descripcion="Complementa la carátula: la IA toma la empresa contratante, la póliza, las vigencias y resume las reglas del plan en Condiciones del Subgrupo."
              onProcesando={(procesando) => {
                setLeyendoComplemento(procesando);
                if (procesando) setNegociacion(null);
              }}
              onLimpiar={() => setNegociacion(null)}
              // Se integra a lo ya capturado en lugar de reemplazar el formulario.
              onAplicar={(datos, archivo) => {
                setNegociacion(archivo.type === "application/pdf" ? archivo : null);
                formRef.current?.aplicarComplemento(aValoresIniciales(datos, aseguradoras));
              }}
            />
          </div>
        )}
      </div>
      <PolizaForm
        key={prellenado.version}
        inicial={prellenado.inicial}
        aseguradoras={aseguradoras}
        ref={formRef}
        extrayendo={extrayendo || leyendoComplemento}
        onRamoChange={setRamo}
        caratula={caratula}
        // Solo aplica mientras el ramo sea GMM Colectivo (el panel se oculta con otro ramo).
        negociacion={ramo === "gmm_colectivo" ? negociacion : null}
        onReiniciar={() => {
          setCaratula(null);
          setExtrayendo(false);
          setLeyendoComplemento(false);
          setNegociacion(null);
          setRonda((r) => r + 1);
        }}
      />
    </div>
  );
}
